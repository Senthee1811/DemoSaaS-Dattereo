import { BadRequestException } from '@nestjs/common';
import { KeysController } from '../src/modules/keys/keys.controller';

/** 7.6 regression: a provider key cannot be saved empty, even by calling the API directly. */
describe('POST /api/v1/keys (type PROVIDER) requires a key', () => {
  const user = { id: 'u1', orgId: 'o1', role: 'OWNER', email: 'a@b.co', name: 'A' };
  const base = { type: 'PROVIDER' as const, projectId: '3c66dcd5-9588-479c-ac9d-83c024ad1032', provider: 'OPENAI' as const, keyName: 'k' };

  function setup() {
    const service = { storeProviderKey: jest.fn(async () => ({ id: 'k1' })), generateGatewayKey: jest.fn() };
    return { service, controller: new KeysController(service as any) };
  }

  it.each([
    ['missing', {}],
    ['empty', { plainKey: '' }],
    ['whitespace only', { plainKey: '   ' }],
  ])('%s key → 400 and nothing stored', async (_label, extra) => {
    const { service, controller } = setup();
    await expect(controller.handleCreateKey({ ...base, ...extra } as any, user)).rejects.toBeInstanceOf(BadRequestException);
    expect(service.storeProviderKey).not.toHaveBeenCalled();
  });

  it('a missing provider → 400', async () => {
    const { service, controller } = setup();
    await expect(controller.handleCreateKey({ ...base, provider: undefined, plainKey: 'sk-x' } as any, user)).rejects.toBeInstanceOf(BadRequestException);
    expect(service.storeProviderKey).not.toHaveBeenCalled();
  });

  it('a real key is stored, trimmed', async () => {
    const { service, controller } = setup();
    await controller.handleCreateKey({ ...base, plainKey: '  sk-real  ' } as any, user);
    expect(service.storeProviderKey).toHaveBeenCalledWith(expect.objectContaining({ plainKey: 'sk-real', provider: 'OPENAI' }), 'o1');
  });
});
