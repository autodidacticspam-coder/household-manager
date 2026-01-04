'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useEmployeesList } from '@/hooks/use-employees';
import { format } from 'date-fns';
import { parseLocalDate } from '@/lib/date-utils';
import { Plus, Search, Mail, Users } from 'lucide-react';

export default function EmployeesPage() {
  const t = useTranslations();
  const router = useRouter();
  const [search, setSearch] = useState('');

  const { data: employees, isLoading } = useEmployeesList();

  const filteredEmployees = employees?.filter((e) =>
    e.fullName.toLowerCase().includes(search.toLowerCase()) ||
    e.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('employees.title')}</h1>
          <p className="text-muted-foreground">
            {t('descriptions.employees')}
          </p>
        </div>
        <Button onClick={() => router.push('/employees/new')}>
          <Plus className="h-4 w-4 mr-2" />
          {t('employees.addEmployee')}
        </Button>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('common.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : filteredEmployees && filteredEmployees.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('employees.fullName')}</TableHead>
                  <TableHead className="hidden md:table-cell">{t('employees.email')}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t('employees.groups')}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t('employees.hireDate')}</TableHead>
                  <TableHead>{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEmployees.map((employee) => (
                  <TableRow key={employee.id}>
                    <TableCell>
                      <div className="flex items-center space-x-3">
                        <Avatar className="h-9 w-9">
                          <AvatarImage src={employee.avatarUrl || undefined} />
                          <AvatarFallback>
                            {employee.fullName?.[0] || 'U'}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{employee.fullName}</p>
                          <p className="text-sm text-muted-foreground md:hidden">
                            {employee.email}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex items-center text-sm">
                        <Mail className="h-4 w-4 mr-1 text-muted-foreground" />
                        {employee.email}
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {employee.groups.length > 0 ? (
                          employee.groups.map((group) => (
                            <Badge key={group.id} variant="secondary" className="text-xs">
                              {group.name}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {employee.profile?.hireDate ? (
                        format(parseLocalDate(employee.profile.hireDate), 'MMM d, yyyy')
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push(`/employees/${employee.id}`)}
                      >
                        {t('common.details')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-8 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">{t('employees.noEmployees')}</p>
            <Button
              variant="link"
              onClick={() => router.push('/employees/new')}
              className="mt-2"
            >
              {t('employees.addEmployee')}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
