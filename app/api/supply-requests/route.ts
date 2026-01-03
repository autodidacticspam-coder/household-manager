import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const createSupplyRequestSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().max(2000).optional(),
  productUrl: z.string().url('Invalid URL').optional().or(z.literal('')),
});

// POST handler for creating a supply request
export async function POST(request: NextRequest) {
  try {
    const input = await request.json();

    const result = createSupplyRequestSchema.safeParse(input);
    if (!result.success) {
      return NextResponse.json({ error: result.error.issues[0].message }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { title, description, productUrl } = result.data;

    const { data: supplyRequest, error } = await supabase
      .from('supply_requests')
      .insert({
        user_id: user.id,
        title,
        description: description || null,
        product_url: productUrl || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Supply request creation error:', error);
      return NextResponse.json({ error: 'Failed to create supply request' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: { id: supplyRequest.id } });
  } catch (err) {
    console.error('Supply request creation error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
