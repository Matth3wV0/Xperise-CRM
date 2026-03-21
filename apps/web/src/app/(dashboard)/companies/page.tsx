"use client";

import { useEffect, useState } from "react";
import { Plus, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiGet } from "@/lib/api";
import { INDUSTRIES } from "@xperise/shared";

interface Company {
  id: string;
  name: string;
  industry: string;
  country: string | null;
  size: string | null;
  fitScore: number | null;
  _count: { contacts: number; pipelines: number };
}

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await apiGet<{ data: Company[] }>("/companies?limit=100");
        setCompanies(res.data);
      } catch (err) {
        console.error("Failed to load companies:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Companies</h1>
          <p className="text-muted-foreground">{companies.length} companies</p>
        </div>
        <Button size="sm">
          <Plus className="mr-2 h-4 w-4" /> Add Company
        </Button>
      </div>

      {loading ? (
        <div className="flex h-[30vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {companies.map((company) => {
            const industry = INDUSTRIES.find((i) => i.value === company.industry);
            return (
              <Card key={company.id} className="cursor-pointer hover:border-primary/50 transition-colors">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                        <Building2 className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{company.name}</h3>
                        <p className="text-xs text-muted-foreground">
                          {industry?.label ?? company.industry}
                          {company.country && ` · ${company.country}`}
                        </p>
                      </div>
                    </div>
                    {company.fitScore && (
                      <Badge variant="outline">{company.fitScore}/5</Badge>
                    )}
                  </div>
                  <div className="mt-4 flex gap-4 text-sm text-muted-foreground">
                    <span>{company._count.contacts} contacts</span>
                    <span>{company._count.pipelines} deals</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
