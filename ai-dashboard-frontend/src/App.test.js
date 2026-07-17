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
  expect(screen.getByRole('heading', { name: /item wise count/i })).toBeInTheDocument();
  expect(screen.queryByText(/cups visible/i)).not.toBeInTheDocument();
});

test('renders the separate AI camera dashboard', () => {
  window.history.pushState({}, '', '/camera');
  render(<App />);
  expect(screen.getByRole('heading', { name: /ai camera dashboard/i })).toBeInTheDocument();
  expect(screen.getByText(/^cups visible$/i)).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: /item wise count/i })).not.toBeInTheDocument();
});
