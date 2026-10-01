export default function Loading() {
  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4 animate-pulse">
      <div className="h-8 bg-gray-800 rounded w-48" />
      <div className="h-48 bg-gray-800 rounded" />
      <div className="h-32 bg-gray-900 rounded border border-gray-800 space-y-3 p-4">
        {[1,2,3].map((i) => (
          <div key={i} className="h-10 bg-gray-800 rounded" />
        ))}
      </div>
    </div>
  );
}
