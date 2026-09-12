import React from 'react';
import { Link } from 'react-router-dom';
import { Home, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4">
      <div className="space-y-6 max-w-md">
        <Badge
          variant="destructive"
          className="px-3 py-1 text-xs uppercase font-mono tracking-widest"
        >
          404 &bull; Page Not Found
        </Badge>
        <h1 className="text-5xl font-extrabold tracking-tight text-foreground">
          Lost in Orbit?
        </h1>
        <p className="text-muted-foreground leading-relaxed">
          The page you are looking for doesn&apos;t exist or might have been
          relocated. Let&apos;s get you back on track.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Link to="/">
            <Button size="lg" className="w-full sm:w-auto gap-2">
              <Home className="h-4 w-4" />
              <span>Back to Home</span>
            </Button>
          </Link>
          <Button
            variant="outline"
            size="lg"
            onClick={() => window.history.back()}
            className="w-full sm:w-auto gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Go Back</span>
          </Button>
        </div>
      </div>
    </div>
  );
};
