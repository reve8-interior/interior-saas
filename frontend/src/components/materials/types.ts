'use client';

export interface MarginConfig {
  id: string;
  category: string | null;
  margin_percent: number;
}

export interface ServerRow {
  name: string;
  category: string;
  unit: string;
  unit_cost: number;
  vendor: string | null;
}
