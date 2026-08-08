import { render, screen } from '@testing-library/react';
import App from './App';

beforeEach(() => {
  global.fetch = jest.fn(() => new Promise(() => {}));
});

afterEach(() => {
  jest.clearAllMocks();
});

test('renders the separate billing dashboard', () => {
  window.history.pushState({}, '', '/billing');
  render(<App />);
  expect(screen.getByRole('heading', { name: /billing dashboard/i })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /sales by item/i })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /are all drinks billed/i })).toBeInTheDocument();
});

test('renders the separate AI camera dashboard', () => {
  window.history.pushState({}, '', '/camera');
  render(<App />);
  expect(screen.getByRole('heading', { name: /ai camera dashboard/i })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /billing and ai camera/i })).toBeInTheDocument();
  expect(screen.getByText(/^billing cup count$/i)).toBeInTheDocument();
  expect(screen.getByText(/^ai camera cup count$/i)).toBeInTheDocument();
  expect(screen.getByText(/^running cups total$/i)).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: /sales by item/i })).not.toBeInTheDocument();
});
