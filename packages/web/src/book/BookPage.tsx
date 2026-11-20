/** Book page placeholder; the storyline timeline is added in later tasks. */
import { Link, useParams } from 'react-router-dom';
import { useBook } from '../api/hooks';

/** Shows the book title for now. */
export function BookPage() {
  const { bookId = '' } = useParams();
  const book = useBook(bookId);
  return (
    <main className="page">
      <Link to="/">← Meine Bücher</Link>
      {book.isPending && <p className="muted">Laden …</p>}
      {book.isError && <p className="error">Buch nicht gefunden.</p>}
      {book.data && <h1>{book.data.book.title}</h1>}
    </main>
  );
}
