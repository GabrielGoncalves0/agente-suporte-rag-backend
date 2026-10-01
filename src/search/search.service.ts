import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import OpenAI from 'openai';

// Interface que define o formato do chunk retornado pelo banco
export interface SearchResultChunk {
  id: string;
  document_id: string;
  document_title: string;
  content: string;
  score: number;
}

// Interface que representa o resultado final fundido pelo RRF
export interface HybridSearchResult {
  id: string;
  documentId: string;
  documentTitle: string;
  content: string;
  rrfScore: number;
  sources: {
    vectorRank?: number;
    textRank?: number;
  };
}

@Injectable()
export class SearchService {
  private openai: OpenAI;

  constructor(private readonly prisma: PrismaService) {
    // Inicializa o cliente apontando para o OpenRouter
    this.openai = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY || 'fake-key-for-dev',
    });
  }

  // ---------------------------------------------------------------------------
  // 1. BUSCA SEMÂNTICA (pgvector)
  // ---------------------------------------------------------------------------
  private async vectorSearch(query: string, limit = 20): Promise<SearchResultChunk[]> {
    // 1.1 Converte a pergunta do usuário em um embedding de 1536 números
    const embeddingResponse = await this.openai.embeddings.create({
      model: 'openai/text-embedding-3-small',
      input: query,
    });

    const vector = embeddingResponse.data[0].embedding;
    const vectorString = `[${vector.join(',')}]`;

    // 1.2 Query SQL: Calcula a similaridade de cosseno (<=>) com casting ::vector
    // JOIN com a tabela documents para trazer o título do documento pai
    const results = await this.prisma.$queryRaw<SearchResultChunk[]>`
      SELECT 
        c.id,
        c.document_id,
        d.title AS document_title,
        c.content,
        (1 - (c.embedding <=> ${vectorString}::vector)) AS score
      FROM "document_chunks" c
      JOIN "documents" d ON d.id = c.document_id
      ORDER BY c.embedding <=> ${vectorString}::vector ASC
      LIMIT ${limit};
    `;

    return results;
  }

  // ---------------------------------------------------------------------------
  // 2. BUSCA TEXTUAL EXATA (PostgreSQL Full-Text Search)
  // ---------------------------------------------------------------------------
  private async textSearch(query: string, limit = 20): Promise<SearchResultChunk[]> {
    // plainto_tsquery sanitiza a string e lida com pontuações e espaços com segurança
    const results = await this.prisma.$queryRaw<SearchResultChunk[]>`
      SELECT 
        c.id,
        c.document_id,
        d.title AS document_title,
        c.content,
        ts_rank_cd(to_tsvector('portuguese', c.content), plainto_tsquery('portuguese', ${query})) AS score
      FROM "document_chunks" c
      JOIN "documents" d ON d.id = c.document_id
      WHERE to_tsvector('portuguese', c.content) @@ plainto_tsquery('portuguese', ${query})
      ORDER BY score DESC
      LIMIT ${limit};
    `;

    return results;
  }

  // ---------------------------------------------------------------------------
  // 3. ALGORITMO RRF (Reciprocal Rank Fusion)
  // ---------------------------------------------------------------------------
  private applyRrf(
    vectorResults: SearchResultChunk[],
    textResults: SearchResultChunk[],
    limit = 4,
    k = 60, // Constante matemática padrão da literatura para suavizar rankings
  ): HybridSearchResult[] {
    const scoresMap = new Map<string, HybridSearchResult>();

    // Processa o ranking da busca vetorial (1º lugar, 2º lugar...)
    vectorResults.forEach((item, index) => {
      const rank = index + 1;
      const score = 1 / (k + rank);

      scoresMap.set(item.id, {
        id: item.id,
        documentId: item.document_id,
        documentTitle: item.document_title,
        content: item.content,
        rrfScore: score,
        sources: { vectorRank: rank },
      });
    });

    // Processa o ranking da busca textual e soma na pontuação
    textResults.forEach((item, index) => {
      const rank = index + 1;
      const score = 1 / (k + rank);

      if (scoresMap.has(item.id)) {
        // Se o chunk apareceu nas duas buscas, soma os scores (ganha prioridade máxima!)
        const existing = scoresMap.get(item.id)!;
        existing.rrfScore += score;
        existing.sources.textRank = rank;
      } else {
        // Se apareceu apenas na busca textual, adiciona no mapa
        scoresMap.set(item.id, {
          id: item.id,
          documentId: item.document_id,
          documentTitle: item.document_title,
          content: item.content,
          rrfScore: score,
          sources: { textRank: rank },
        });
      }
    });

    // Ordena do maior score RRF para o menor e retorna os Top K
    return Array.from(scoresMap.values())
      .sort((a, b) => b.rrfScore - a.rrfScore)
      .slice(0, limit);
  }

  // ---------------------------------------------------------------------------
  // 4. MÉTODO PÚBLICO: Executa a Busca Híbrida Completa
  // ---------------------------------------------------------------------------
  async hybridSearch(query: string, limit = 4): Promise<HybridSearchResult[]> {
    if (!query || query.trim().length === 0) {
      throw new BadRequestException('O termo de busca não pode ser vazio.');
    }

    // Executa as duas buscas em paralelo no PostgreSQL para menor latência
    const [vectorResults, textResults] = await Promise.all([
      this.vectorSearch(query),
      this.textSearch(query),
    ]);

    // Aplica a fusão de rankings RRF
    return this.applyRrf(vectorResults, textResults, limit);
  }
}