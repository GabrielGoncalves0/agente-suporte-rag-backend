// Importa os decorators e interfaces de ciclo de vida do NestJS
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';

// Importa a classe oficial gerada pelo Prisma Client
import { PrismaClient } from '@prisma/client';

// @Injectable() registra esta classe no container de Injeção de Dependência do NestJS
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  // Executado automaticamente assim que o NestJS termina de carregar os módulos
  async onModuleInit() {
    // Abre a conexão com o PostgreSQL rodando no Docker na porta 5433
    await this.$connect();
    console.log('✅ [PrismaService] Conectado com sucesso ao PostgreSQL (pgvector ativo)!');
  }

  // Executado automaticamente quando a aplicação é finalizada (ex: Ctrl+C ou novo deploy)
  async onModuleDestroy() {
    // Fecha a conexão de forma limpa para evitar conexões presas no banco
    await this.$disconnect();
    console.log('🔌 [PrismaService] Conexão com o PostgreSQL encerrada com sucesso.');
  }
}
