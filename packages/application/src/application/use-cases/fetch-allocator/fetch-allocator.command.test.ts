import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Container } from 'inversify';
import { TYPES } from '@src/types';
import { Logger } from '@filecoin-plus/core';
import { GithubClient, IGithubClient } from '@src/infrastructure/clients/github';
import { FetchAllocatorCommand, FetchAllocatorCommandHandler } from './fetch-allocator.command';
import config from '@src/config';
import { HttpStatusCode } from 'axios';

describe('FetchAllocatorCommand', () => {
  let container: Container;
  let handler: FetchAllocatorCommandHandler;
  const loggerMock = { info: vi.fn(), error: vi.fn() } as unknown as Logger;
  const githubClientMock = { getFile: vi.fn() };

  beforeEach(() => {
    container = new Container();

    container.bind<Logger>(TYPES.Logger).toConstantValue(loggerMock);
    container
      .bind<IGithubClient>(TYPES.GithubClient)
      .toConstantValue(githubClientMock as unknown as GithubClient);
    container.bind<FetchAllocatorCommandHandler>(FetchAllocatorCommandHandler).toSelf();

    handler = container.get<FetchAllocatorCommandHandler>(FetchAllocatorCommandHandler);

    vi.clearAllMocks();
  });

  it('should successfully fetch and map allocator file', async () => {
    const jsonNumber = 'rec123';
    const mockFileContent = { content: JSON.stringify({ name: 'test' }) };
    githubClientMock.getFile.mockResolvedValueOnce(mockFileContent);

    const result = await handler.handle(new FetchAllocatorCommand(jsonNumber));

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ name: 'test' });
    expect(githubClientMock.getFile).toHaveBeenCalledWith(
      config.GITHUB_OWNER,
      config.GITHUB_REPO,
      `Allocators/${jsonNumber}.json`,
    );
  });
  
  it('should handle github 404 error when fetching allocator file fails', async () => {
    const jsonNumber = 'rec123';
    const error = {
      status: HttpStatusCode.NotFound,
    };
    githubClientMock.getFile.mockRejectedValueOnce(error);

    const result = await handler.handle(new FetchAllocatorCommand(jsonNumber));

    expect(result.success).toBe(false);
    expect(result.error).toStrictEqual(
      new Error(
        `The Allocator could not be found for the given JSON number or hash: ${jsonNumber}`,
      ),
    );
  });

  it('should handle github default error when fetching allocator file fails', async () => {
    const jsonNumber = 'rec123';
    const error = {
      status: HttpStatusCode.BadRequest,
    };
    githubClientMock.getFile.mockRejectedValueOnce(error);

    const result = await handler.handle(new FetchAllocatorCommand(jsonNumber));

    expect(result.success).toBe(false);
    expect(result.error).toStrictEqual(new Error('Failed to fetch JSON number'));
  });
});
