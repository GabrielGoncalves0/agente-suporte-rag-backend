// Importa os decoradores do class-validator para validação de entrada
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateDocumentDto {
  // O título do documento (ex: "Política de Reembolso e Devoluções")
  @IsString({ message: 'O título deve ser um texto' })
  @IsNotEmpty({ message: 'O título é obrigatório' })
  title: string;

  // O conteúdo de texto completo do documento a ser fatiado e vetorizado
  @IsString({ message: 'O conteúdo deve ser um texto' })
  @IsNotEmpty({ message: 'O conteúdo é obrigatório' })
  content: string;

  // Metadados adicionais opcionais em JSON (ex: { autor: "Jurídico", versao: "2.0" })
  @IsOptional()
  metadata?: Record<string, any>;
}