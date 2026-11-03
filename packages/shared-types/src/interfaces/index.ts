// ==============================================================================
// AETHRA — Shared Domain Interfaces & DTO Envelopes
// ==============================================================================

import { UserRole } from '../enums/index.js';

export interface TenantContext {
  organisationId: string;
  organisationName?: string;
  isSuspended: boolean;
  activeModules: string[];
}

export interface AuthenticatedUser {
  userId: string;
  email: string;
  fullName: string;
  phone?: string;
  roles: UserRole[];
  currentOrganisationId?: string;
  permissions: string[];
}

export interface RequestMetadata {
  correlationId: string;
  timestamp: string;
  clientIp?: string;
  userAgent?: string;
  clientPlatform?: 'web' | 'android' | 'ios' | 'system';
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta: RequestMetadata;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  nextCursor?: string;
}

export interface PaginatedResult<T> {
  success: boolean;
  data: T[];
  pagination: PaginationMeta;
  meta: RequestMetadata;
}

export interface InvalidParamDetail {
  field: string;
  reason: string;
  code?: string;
}

export interface ApiErrorProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: string;
  correlationId: string;
  invalidParams?: InvalidParamDetail[];
}
