/** Application route table. */
import { Route, Routes } from 'react-router-dom';
import { LoginPage } from './auth/LoginPage';
import { RegisterPage } from './auth/RegisterPage';
import { RequireAuth } from './auth/RequireAuth';
import { BookPage } from './book/BookPage';
import { BookListPage } from './books/BookListPage';

/** Routes: public auth pages, protected book list and book page. */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/" element={<RequireAuth><BookListPage /></RequireAuth>} />
      <Route path="/books/:bookId" element={<RequireAuth><BookPage /></RequireAuth>} />
    </Routes>
  );
}
