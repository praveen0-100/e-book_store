import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon.jsx';

export default function NotFound() {
  return (
    <div className="container empty" style={{ padding: '120px 0' }}>
      <Icon name="book" size={44} />
      <h2 className="serif" style={{ fontSize: 40 }}>Page not found</h2>
      <p>The page you’re looking for has been moved or doesn’t exist.</p>
      <Link to="/books" className="btn btn-gold" style={{ marginTop: 24 }}>Back to the library</Link>
    </div>
  );
}
