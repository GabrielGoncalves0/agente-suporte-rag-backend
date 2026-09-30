import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService
    extends PrismaClient
    implements OnModuleInit, OnModuleDestroy {
    async onModuleInit() {
        await this.$connect();
        console.log('Conectado com sucesso ao postgreSQL via Prisma!');
    }

    async onModuleDestroy() {
        await this.$disconnect();
        console.log('Desconectado do PostgreSQL!');
    }
}