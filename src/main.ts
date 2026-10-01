import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
// Importa o pipe de validação global do NestJS
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Ativa a validação automática em todos os endpoints com base nos DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      // whitelist: true remove qualquer campo inesperado que o cliente enviar (segurança)
      whitelist: true,
      // transform: true converte os payloads para instâncias das classes DTO
      transform: true,
    }),
  );

  // Habilita CORS para permitir que o frontend Next.js faça requisições para a API
  app.enableCors();

  // Inicia o servidor na porta 3001 (deixando a porta 3000 livre para o Next.js)
  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`🚀 [Backend] API NestJS rodando com sucesso em: http://localhost:${port}`);
}
bootstrap();
