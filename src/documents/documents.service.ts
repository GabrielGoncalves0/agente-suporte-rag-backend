import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDocumentDto } from './dto/create-document.dto';
// Importa o cliente oficial da OpenAI para integração com OpenRouter
import OpenAI from 'openai';

@Injectable()
export class DocumentsService {
  private openai: OpenAI;

  constructor(private readonly prisma: PrismaService) {
    // Inicializa o cliente OpenAI apontando para a baseURL do OpenRouter
    this.openai = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY || 'fake-key-for-dev',
    });
  }

  // ---------------------------------------------------------------------------
  // ALGORITMO DETERMINÍSTICO DE CHUNKING COM OVERLAP
  // Divide textos longos em pedaços menores mantendo o contexto nas fronteiras
  // ---------------------------------------------------------------------------
  private splitIntoChunks(text: string, chunkSize = 1000, overlap = 150): string[] {
    const chunks: string[] = [];
    let startIndex = 0;

    // Enquanto não atingir o final da string
    while (startIndex < text.length) {
      // Extrai uma fatia de texto respeitando o chunkSize
      const chunk = text.slice(startIndex, startIndex + chunkSize).trim();

      if (chunk.length > 0) {
        chunks.push(chunk);
      }

      // Desloca o ponteiro recuando o tamanho do overlap para evitar corte seco
      startIndex += chunkSize - overlap;
    }

    return chunks;
  }

  // ---------------------------------------------------------------------------
  // PIPELINE ENTERPRISE DE INGESTÃO (Batching + Transação Atômica ACID)
  // ---------------------------------------------------------------------------
  async create(createDocumentDto: CreateDocumentDto) {
    try {
      // ETAPA 1: Fatiar o conteúdo em memória antes de tocar no banco de dados
      const textChunks = this.splitIntoChunks(createDocumentDto.content);

      if (textChunks.length === 0) {
        throw new Error('O conteúdo fornecido não gerou nenhum pedaço de texto válido.');
      }

      // ETAPA 2: Gerar os embeddings na OpenAI/OpenRouter em uma única requisição HTTP em lote (Batch)
      // Se a IA der timeout ou erro de cota, abortamos aqui sem ter sujado o banco de dados!
      const embeddingResponse = await this.openai.embeddings.create({
        model: 'openai/text-embedding-3-small',
        input: textChunks,
      });

      // ETAPA 3: TRANSAÇÃO ATÔMICA NO POSTGRESQL (Padrão Enterprise ACID)
      // Se qualquer chunk falhar, o documento pai e todos os outros chunks sofrem Rollback instantâneo.
      const result = await this.prisma.$transaction(async (tx) => {
        // 3.1 Cria o registro do Documento Pai dentro da transação
        const document = await tx.document.create({
          data: {
            title: createDocumentDto.title,
            content: createDocumentDto.content,
            metadata: createDocumentDto.metadata,
          },
        });

        // 3.2 Prepara todas as queries de inserção com o casting nativo ::vector do pgvector
        const insertOperations = textChunks.map((chunkText, i) => {
          const vector = embeddingResponse.data[i].embedding;
          const vectorString = `[${vector.join(',')}]`;

          return tx.$executeRaw`
            INSERT INTO "document_chunks" ("id", "document_id", "content", "embedding", "created_at")
            VALUES (gen_random_uuid(), ${document.id}, ${chunkText}, ${vectorString}::vector, NOW());
          `;
        });

        // 3.3 Executa todas as inserções de chunks em paralelo dentro do túnel da transação
        await Promise.all(insertOperations);

        return document;
      });

      console.log(`✅ [Enterprise RAG] Documento "${result.title}" e seus ${textChunks.length} chunks salvos com atomicidade!`);

      return {
        message: 'Documento fatiado e indexado com sucesso!',
        documentId: result.id,
        title: result.title,
        totalChunks: textChunks.length,
      };
    } catch (error) {
      console.error('❌ [Enterprise Ingestion Error]:', error);
      throw new InternalServerErrorException('Falha no pipeline de ingestão e indexação vetorial.');
    }
  }

  // Lista todos os documentos cadastrados com a contagem exata de chunks
  async findAll() {
    return this.prisma.document.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { chunks: true },
        },
      },
    });
  }

  // Busca um documento pelo ID e seus chunks (omitindo a coluna de embedding para economizar banda)
  async findOne(id: string) {
    const document = await this.prisma.document.findUnique({
      where: { id },
      include: {
        chunks: {
          select: {
            id: true,
            content: true,
            createdAt: true,
          },
        },
      },
    });

    if (!document) {
      throw new NotFoundException(`Documento com ID "${id}" não foi encontrado.`);
    }

    return document;
  }

  // Deleta o documento pai (dispara onDelete: Cascade automático no pgvector)
  async remove(id: string) {
    const exists = await this.prisma.document.findUnique({ where: { id } });
    if (!exists) {
      throw new NotFoundException(`Documento com ID "${id}" não foi encontrado.`);
    }

    await this.prisma.document.delete({ where: { id } });

    return { message: `Documento "${exists.title}" e todos os seus vetores foram excluídos com sucesso.` };
  }
}
