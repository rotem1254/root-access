import './styles/tokens.css';
import { ENGINE_VERSION } from './engine';

const app = document.getElementById('app');
if (app) {
  app.textContent = `ROOT_ACCESS engine v${ENGINE_VERSION}: booting…`;
}
