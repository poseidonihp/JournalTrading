import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../prisma/client';
import type { User as PrismaUser } from '../../prisma/client';
import * as bcrypt from 'bcryptjs';
import type { User } from '@journal/shared-types';
import { PrismaService } from '../../prisma/prisma.service';

const BCRYPT_ROUNDS = 12;
const EMAIL_TAKEN_MSG = 'Ya existe un usuario con ese email';
const USER_NOT_FOUND_MSG = 'Usuario no encontrado';

interface CreateUserInput {
  email: string;
  displayName: string;
  password: string;
  timezone?: string;
  locale?: string;
}

interface UpdateUserInput {
  email?: string;
  displayName?: string;
  password?: string;
  timezone?: string;
  locale?: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<User[]> {
    const rows = await this.prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((u) => UsersService.toDto(u));
  }

  async getById(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(USER_NOT_FOUND_MSG);
    }
    return UsersService.toDto(user);
  }

  async create(input: CreateUserInput): Promise<User> {
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    try {
      const created = await this.prisma.user.create({
        data: {
          email: input.email,
          displayName: input.displayName,
          passwordHash,
          ...(input.timezone ? { timezone: input.timezone } : {}),
          ...(input.locale ? { locale: input.locale } : {}),
        },
      });
      return UsersService.toDto(created);
    } catch (e) {
      if (UsersService.isUniqueViolation(e)) {
        throw new ConflictException(EMAIL_TAKEN_MSG);
      }
      throw e;
    }
  }

  async update(id: string, input: UpdateUserInput): Promise<User> {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(USER_NOT_FOUND_MSG);
    }

    const data: Prisma.UserUpdateInput = {};
    if (input.email !== undefined) {
      data.email = input.email;
    }
    if (input.displayName !== undefined) {
      data.displayName = input.displayName;
    }
    if (input.timezone !== undefined) {
      data.timezone = input.timezone;
    }
    if (input.locale !== undefined) {
      data.locale = input.locale;
    }
    if (input.password !== undefined) {
      data.passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    }

    try {
      const updated = await this.prisma.user.update({ where: { id }, data });
      return UsersService.toDto(updated);
    } catch (e) {
      if (UsersService.isUniqueViolation(e)) {
        throw new ConflictException(EMAIL_TAKEN_MSG);
      }
      throw e;
    }
  }

  async remove(id: string): Promise<void> {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(USER_NOT_FOUND_MSG);
    }
    await this.prisma.user.delete({ where: { id } });
  }

  private static isUniqueViolation(e: unknown): boolean {
    return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
  }

  private static toDto(u: PrismaUser): User {
    return {
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      timezone: u.timezone,
      locale: u.locale,
      createdAt: u.createdAt.toISOString(),
      updatedAt: u.updatedAt.toISOString(),
    };
  }
}
