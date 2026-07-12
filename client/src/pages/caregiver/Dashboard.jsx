import { useAuth } from '../../context/AuthContext';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const DADI_ID = '6a5249b712a35b6292fbe3fa'; // temp hardcode; patient picker comes later

  return (
    <div style={{ maxWidth: 720, margin: '5vh auto', fontFamily: 'system-ui' }}>
      <h1>Namaste, {user.name}</h1>
      <p><Link to={`/mirror/${DADI_ID}`}>Open Dadi's Mirror →</Link></p>
      <button onClick={logout}>Log out</button>
    </div>
  );
}