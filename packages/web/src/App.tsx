/** Application route table. */
import { Route, Routes } from 'react-router-dom';
import { LoginPage } from './auth/LoginPage';
import { RegisterPage } from './auth/RegisterPage';
import { RequireAuth } from './auth/RequireAuth';
import { BookPage } from './book/BookPage';
import { BookListPage } from './books/BookListPage';
import { ManuscriptPage } from './manuscript/ManuscriptPage';
import { PreviewPage } from './manuscript/PreviewPage';

/** Routes: public auth pages, protected book list and book page. */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/" element={<RequireAuth><BookListPage /></RequireAuth>} />
      <Route path="/books/:bookId" element={<RequireAuth><BookPage /></RequireAuth>} />
      <Route path="/books/:bookId/manuskript" element={<RequireAuth><ManuscriptPage /></RequireAuth>} />
      <Route path="/books/:bookId/manuskript/vorschau" element={<RequireAuth><PreviewPage /></RequireAuth>} />
    </Routes>
  );
}
