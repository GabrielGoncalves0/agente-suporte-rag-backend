// Importa decorators do NestJS para criar módulos
import { Global, Module } from '@nestjs/common';

// Importa o serviço do Prisma que acabamos de criar
import { PrismaService } from './prisma.service';

// @Global() torna este módulo disponível globalmente em toda a aplicação:
// Nenhum outro módulo precisará importar o PrismaModule explicitamente para usar o PrismaService!
@Global()
@Module({
  // Registra o PrismaService como provedor deste módulo
  providers: [PrismaService],

  // Exporta o PrismaService para que outros módulos (Documents, Chat, etc.) consigam injetá-lo
  exports: [PrismaService],
})
export class PrismaModule {}
