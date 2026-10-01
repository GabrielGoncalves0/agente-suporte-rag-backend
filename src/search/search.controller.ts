import { Controller, Get, Query } from '@nestjs/common';
import { SearchService } from './search.service';

@Controller('search')
export class SearchController {
    constructor(private readonly searchService: SearchService) { }

    @Get()
    async search(
        @Query('q') query: string,
        @Query('limit') limit?: number,
    ) {
        return this.searchService.hybridSearch(query, limit ? Number(limit) : 4);
    }
}