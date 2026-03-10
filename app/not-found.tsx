export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white">404</h1>
        <p className="mt-2 text-gray-400">Page not found.</p>
        <a href="/" className="mt-4 inline-block text-sm text-indigo-400 hover:text-indigo-300">
          Go home
        </a>
      </div>
    </div>
  );
}
