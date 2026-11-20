/** Tests for the login and register pages. */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/render';
import { server } from '../test/setup';

const user = { id: 'u1', email: 'a@b.de', displayName: 'Anna' };
const unauthorized = () => HttpResponse.json({ error: 'unauthorized' }, { status: 401 });

describe('LoginPage', () => {
  it('posts credentials and navigates to the book list', async () => {
    let posted: unknown;
    let loggedIn = false;
    server.use(
      http.get('/api/auth/me', () => (loggedIn ? HttpResponse.json({ user }) : unauthorized())),
      http.post('/api/auth/login', async ({ request }) => {
        posted = await request.json();
        loggedIn = true;
        return HttpResponse.json({ user });
      }),
      http.get('/api/books', () => HttpResponse.json([])),
    );
    renderApp('/login');
    await userEvent.type(await screen.findByLabelText('E-Mail'), 'a@b.de');
    await userEvent.type(screen.getByLabelText('Passwort'), 'geheim1234');
    await userEvent.click(screen.getByRole('button', { name: 'Anmelden' }));
    expect(await screen.findByRole('heading', { name: 'Meine Bücher' })).toBeInTheDocument();
    expect(posted).toEqual({ email: 'a@b.de', password: 'geheim1234' });
  });

  it('shows an error on 401', async () => {
    server.use(
      http.get('/api/auth/me', unauthorized),
      http.post('/api/auth/login', () => HttpResponse.json({ error: 'invalid_credentials' }, { status: 401 })),
    );
    renderApp('/login');
    await userEvent.type(await screen.findByLabelText('E-Mail'), 'a@b.de');
    await userEvent.type(screen.getByLabelText('Passwort'), 'falsch');
    await userEvent.click(screen.getByRole('button', { name: 'Anmelden' }));
    expect(await screen.findByText('E-Mail oder Passwort ist falsch.')).toBeInTheDocument();
  });

  it('shows a message when the email is already registered', async () => {
    server.use(
      http.get('/api/auth/me', unauthorized),
      http.post('/api/auth/register', () => HttpResponse.json({ error: 'email_taken' }, { status: 409 })),
    );
    renderApp('/register');
    await userEvent.type(await screen.findByLabelText('Anzeigename'), 'Anna');
    await userEvent.type(screen.getByLabelText('E-Mail'), 'a@b.de');
    await userEvent.type(screen.getByLabelText('Passwort'), 'geheim1234');
    await userEvent.click(screen.getByRole('button', { name: 'Registrieren' }));
    expect(await screen.findByText('Diese E-Mail ist bereits registriert.')).toBeInTheDocument();
  });
});
