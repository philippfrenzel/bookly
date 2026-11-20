/** Test helper: renders the app routes inside a fresh QueryClient and MemoryRouter. */
import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { createQueryClient } from '../api/queryClient';
import { AppRoutes } from '../App';

/** Renders the application at the given route with isolated query state. */
export function renderApp(route = '/') {
  const queryClient = createQueryClient(false);
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
