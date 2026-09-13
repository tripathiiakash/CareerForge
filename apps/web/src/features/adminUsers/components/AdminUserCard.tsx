import React from 'react';
import {
  Building2,
  Calendar,
  Mail,
  Trash2,
  User,
  Shield,
  Briefcase,
  GraduationCap,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AdminUser, AdminUserRole } from '../types';

export function formatUserDate(dateString?: string | null): string {
  if (!dateString) return 'Recently';
  try {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return 'Recently';
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return 'Recently';
  }
}

export function getUserDisplayName(user: AdminUser): string {
  if (user.student?.first_name || user.student?.last_name) {
    return `${user.student.first_name || ''} ${user.student.last_name || ''}`.trim();
  }
  if (user.recruiter?.first_name || user.recruiter?.last_name) {
    return `${user.recruiter.first_name || ''} ${user.recruiter.last_name || ''}`.trim();
  }
  if (user.role === 'ADMIN') {
    return 'Administrator';
  }
  return user.email.split('@')[0] || 'Platform User';
}

export function getRoleBadgeConfig(role: AdminUserRole): {
  label: string;
  variant: 'default' | 'secondary' | 'outline' | 'info' | 'warning';
  icon: React.ComponentType<{ className?: string }>;
} {
  switch (role) {
    case 'STUDENT':
      return {
        label: 'Student',
        variant: 'info',
        icon: GraduationCap,
      };
    case 'RECRUITER':
      return {
        label: 'Recruiter',
        variant: 'warning',
        icon: Briefcase,
      };
    case 'ADMIN':
      return {
        label: 'Admin',
        variant: 'default',
        icon: Shield,
      };
    default:
      return {
        label: role,
        variant: 'outline',
        icon: User,
      };
  }
}

export interface AdminUserCardProps {
  user: AdminUser;
  onDelete?: (user: AdminUser) => void;
  isDeleting?: boolean;
}

export const AdminUserCard: React.FC<AdminUserCardProps> = ({
  user,
  onDelete,
  isDeleting = false,
}) => {
  const displayName = getUserDisplayName(user);
  const formattedDate = formatUserDate(user.created_at);
  const roleConfig = getRoleBadgeConfig(user.role);
  const RoleIcon = roleConfig.icon;
  const companyName = user.recruiter?.company?.name;

  return (
    <Card
      glass
      className="border-border/70 hover:border-border transition-all shadow-sm group"
      data-testid={`admin-user-card-${user.id}`}
    >
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Left / Main Info */}
          <div className="flex items-start gap-3.5 min-w-0 flex-1">
            <div className="h-10 w-10 rounded-xl bg-secondary/60 flex items-center justify-center shrink-0 border border-border/50 text-foreground/80 mt-0.5">
              <RoleIcon className="h-5 w-5" />
            </div>

            <div className="space-y-1 min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-bold text-foreground tracking-tight truncate">
                  {displayName}
                </h3>
                <Badge
                  variant={roleConfig.variant}
                  className="gap-1 font-normal text-xs py-0.5 shrink-0"
                >
                  <RoleIcon className="h-3 w-3" />
                  <span>{roleConfig.label}</span>
                </Badge>
                {user.is_banned ? (
                  <Badge
                    variant="destructive"
                    className="font-normal text-xs py-0.5 shrink-0"
                  >
                    Banned
                  </Badge>
                ) : (
                  <Badge
                    variant="success"
                    className="font-normal text-xs py-0.5 shrink-0"
                  >
                    Active
                  </Badge>
                )}
              </div>

              {/* Sub-info: Email, Company, Join Date */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground pt-0.5">
                <a
                  href={`mailto:${user.email}`}
                  className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors truncate max-w-xs"
                  aria-label={`Send email to ${user.email}`}
                >
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{user.email}</span>
                </a>

                {companyName && (
                  <div className="inline-flex items-center gap-1.5 text-foreground/80 font-medium truncate max-w-xs">
                    <Building2 className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                    <span className="truncate">{companyName}</span>
                  </div>
                )}

                <div className="inline-flex items-center gap-1.5 text-muted-foreground shrink-0">
                  <Calendar className="h-3.5 w-3.5 shrink-0" />
                  <span>Joined {formattedDate}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Action: Delete */}
          <div className="flex items-center justify-end shrink-0 sm:self-center pt-2 sm:pt-0 border-t sm:border-t-0 border-border/40">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onDelete?.(user)}
              disabled={isDeleting}
              isLoading={isDeleting}
              className="gap-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40 transition-colors"
              aria-label={`Delete user ${displayName}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Delete</span>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
