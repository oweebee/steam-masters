export default function Loading() {
  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="h-8 w-48 bg-gray-800 rounded animate-pulse mb-6" />
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-12 bg-gray-800 rounded animate-pulse" style={{ opacity: 1 - i * 0.08 }} />
        ))}
      </div>
    </div>
  );
}
