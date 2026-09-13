import React from 'react';
import { Users, RotateCcw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export interface AdminUserEmptyStateProps {
  isFiltered?: boolean;
  onResetFilters?: () => void;
}

export const AdminUserEmptyState: React.FC<AdminUserEmptyStateProps> = ({
  isFiltered = false,
  onResetFilters,
}) => {
  return (
    <Card
      glass
      className="border-border/60 text-center py-12 px-6"
      data-testid="admin-user-empty-state"
    >
      <CardContent className="max-w-md mx-auto space-y-4">
        <div className="h-12 w-12 rounded-2xl bg-secondary/80 text-muted-foreground flex items-center justify-center mx-auto border border-border/50">
          <Users className="h-6 w-6" />
        </div>

        <div className="space-y-1.5">
          <h3 className="text-lg font-bold text-foreground">
            {isFiltered ? 'No Matching Users Found' : 'No Users Registered'}
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {isFiltered
              ? 'No users match your active filter criteria or search query. Try clearing or broadening your search.'
              : 'There are currently no platform users registered in the system.'}
          </p>
        </div>

        {isFiltered && onResetFilters && (
          <div className="pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onResetFilters}
              className="gap-1.5 text-xs"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset Filters</span>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
