import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  CreateUserRequestSchema,
  UpdateUserRequestSchema,
  type CreateUserRequest,
  type UpdateUserRequest,
  type User,
} from '@journal/shared-types';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.dto';
import { CryptoService } from '../auth/crypto.service';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly crypto: CryptoService,
  ) {}

  @Get()
  list(): Promise<User[]> {
    return this.users.list();
  }

  @Get(':id')
  getOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<User> {
    return this.users.getById(id);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(CreateUserRequestSchema)) dto: CreateUserRequest,
  ): Promise<User> {
    const password = this.crypto.decryptPassword(dto.encryptedPassword);
    if (password.length < 8) {
      throw new BadRequestException('Password debe tener al menos 8 caracteres');
    }
    return this.users.create({
      email: dto.email,
      displayName: dto.displayName,
      timezone: dto.timezone,
      locale: dto.locale,
      password,
    });
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateUserRequestSchema)) dto: UpdateUserRequest,
  ): Promise<User> {
    let password: string | undefined;
    if (dto.encryptedPassword !== undefined) {
      password = this.crypto.decryptPassword(dto.encryptedPassword);
      if (password.length < 8) {
        throw new BadRequestException('Password debe tener al menos 8 caracteres');
      }
    }
    return this.users.update(id, {
      email: dto.email,
      displayName: dto.displayName,
      timezone: dto.timezone,
      locale: dto.locale,
      password,
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() current: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    if (current.id === id) {
      throw new ConflictException('No puedes eliminar tu propio usuario');
    }
    await this.users.remove(id);
  }
}
