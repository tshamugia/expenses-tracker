import { supabase } from '@/lib/db/supabase';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Simple connection test - just check auth status
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      return NextResponse.json({ 
        error: error.message 
      }, { status: 500 });
    }

    // Connection successful!
    return NextResponse.json({ 
      success: true, 
      message: 'Supabase connected successfully!',
      project: process.env.SUPABASE_URL,
      authenticated: !!session
    });
  } catch (error) {
    return NextResponse.json({ 
      error: 'Connection failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

