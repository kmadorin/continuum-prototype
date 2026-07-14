import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, act, waitFor } from '@testing-library/react';
import { ToastProvider, useToast } from './Toast';

function Fire() {
  const t = useToast();
  return (
    <button type="button" onClick={() => { t.show('one', 'success'); t.show('two', 'success'); }}>
      fire
    </button>
  );
}

describe('toast dismiss-all', () => {
  afterEach(cleanup);
  it('appears with the second toast and clears the column', async () => {
    render(<ToastProvider><Fire /></ToastProvider>);
    act(() => { screen.getByText('fire').click(); });
    const clear = await screen.findByText('Dismiss all');
    act(() => { clear.click(); });
    await waitFor(() => expect(screen.queryByText('one')).toBeNull());
    expect(screen.queryByText('two')).toBeNull();
  });
});
