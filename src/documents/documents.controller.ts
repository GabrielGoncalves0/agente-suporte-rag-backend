import { Controller, Get, Post, Body, Param, Delete } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { CreateDocumentDto } from './dto/create-document.dto';

// @Controller('documents') define o prefixo da rota para /documents
@Controller('documents')
export class DocumentsController {
  // Injeta o DocumentsService criado anteriormente
  constructor(private readonly documentsService: DocumentsService) {}

  // POST /documents
  // Rota para cadastrar e indexar um novo documento no banco vetorial
  @Post()
  create(@Body() createDocumentDto: CreateDocumentDto) {
    return this.documentsService.create(createDocumentDto);
  }

  // GET /documents
  // Rota para listar todas as normas/documentos existentes na empresa
  @Get()
  findAll() {
    return this.documentsService.findAll();
  }

  // GET /documents/:id
  // Rota para consultar detalhes de um documento específico e seus chunks
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.documentsService.findOne(id);
  }

  // DELETE /documents/:id
  // Rota para excluir uma regra (dispara exclusão em cascata no pgvector)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.documentsService.remove(id);
  }
}
