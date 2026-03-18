import { Link } from "react-router-dom";

const NotFound = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">404</h1>
        <p className="text-gray-600 mb-6">Page not found</p>
        <Link to="/" className="text-indigo-600 hover:text-indigo-700">
          Go back home
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
