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
  expect(screen.getByText(/^total cups$/i)).toBeInTheDocument();
  expect(screen.getByText(/^total bills$/i)).toBeInTheDocument();
  expect(screen.queryByText(/cup count difference/i)).not.toBeInTheDocument();
});

test('renders the separate AI camera dashboard', () => {
  window.history.pushState({}, '', '/camera');
  render(<App />);
  expect(screen.getByRole('heading', { name: /ai camera dashboard/i })).toBeInTheDocument();
  expect(screen.getByText(/^total ai cup count$/i)).toBeInTheDocument();
  expect(screen.getByText(/^staff count$/i)).toBeInTheDocument();
  expect(screen.getByText(/^customer count$/i)).toBeInTheDocument();
  expect(screen.getByText(/^empty count$/i)).toBeInTheDocument();
});

test('renders mismatch on its own dashboard', () => {
  window.history.pushState({}, '', '/compare');
  render(<App />);
  expect(screen.getByRole('heading', { name: /cup mismatch dashboard/i })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /cup count difference/i })).toBeInTheDocument();
  expect(screen.getByText(/^billing cup count$/i)).toBeInTheDocument();
  expect(screen.getByText(/^ai camera cup count$/i)).toBeInTheDocument();
});
