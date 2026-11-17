import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkBackendHealth, API_BASE_URL } from '../services/api';

describe('Frontend API Service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exposes a valid default or configured API_BASE_URL', () => {
    expect(API_BASE_URL).toBeDefined();
    expect(typeof API_BASE_URL).toBe('string');
  });

  it('handles successful backend health response', async () => {
    const mockHealthResponse = {
      status: 'ok',
      application: 'AeroSolve',
      message: 'Backend is running',
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockHealthResponse,
    });

    const result = await checkBackendHealth();
    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockHealthResponse);
    expect(global.fetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/api/health`,
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('handles server HTTP error response gracefully', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ detail: 'Internal Error' }),
    });

    const result = await checkBackendHealth();
    expect(result.success).toBe(false);
    expect(result.error).toContain('HTTP status 500');
  });

  it('handles network failure gracefully', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'));

    const result = await checkBackendHealth();
    expect(result.success).toBe(false);
    expect(result.error).toBe('Failed to fetch');
  });
});
