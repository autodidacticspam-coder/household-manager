import { NextRequest, NextResponse } from 'next/server';
import { createRecipeSchema } from '@/lib/validators/recipe';
import { getApiAdminClient, getApiAuthUser, requireApiAdminRole, handleApiError } from '@/lib/supabase/api-helpers';

export async function GET(request: NextRequest) {
  try {
    const user = await getApiAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const supabaseAdmin = getApiAdminClient();
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search');

    let query = supabaseAdmin
      .from('recipes')
      .select(`
        *,
        media:recipe_media(*)
      `)
      .order('created_at', { ascending: false });

    if (search) {
      // Search in title and ingredients
      query = query.or(`title.ilike.%${search}%,ingredients.cs.[{"item":"${search}"}]`);
    }

    const { data: recipes, error } = await query;

    if (error) {
      console.error('Error fetching recipes:', error);
      return NextResponse.json({ error: 'Failed to fetch recipes' }, { status: 500 });
    }

    // Transform snake_case to camelCase
    const transformedRecipes = recipes?.map(recipe => ({
      id: recipe.id,
      title: recipe.title,
      titleEs: recipe.title_es,
      titleZh: recipe.title_zh,
      description: recipe.description,
      descriptionEs: recipe.description_es,
      descriptionZh: recipe.description_zh,
      ingredients: recipe.ingredients || [],
      instructions: recipe.instructions || [],
      prepTimeMinutes: recipe.prep_time_minutes,
      cookTimeMinutes: recipe.cook_time_minutes,
      servings: recipe.servings,
      sourceUrl: recipe.source_url,
      sourceName: recipe.source_name,
      notes: recipe.notes,
      createdBy: recipe.created_by,
      createdAt: recipe.created_at,
      updatedAt: recipe.updated_at,
      media: recipe.media?.map((m: Record<string, unknown>) => ({
        id: m.id,
        recipeId: m.recipe_id,
        mediaType: m.media_type,
        storageType: m.storage_type,
        url: m.url,
        title: m.title,
        fileName: m.file_name,
        fileSize: m.file_size,
        mimeType: m.mime_type,
        isHero: m.is_hero,
        sortOrder: m.sort_order,
        createdAt: m.created_at,
        createdBy: m.created_by,
      })) || [],
    }));

    return NextResponse.json(transformedRecipes);
  } catch (err) {
    const { error, status } = handleApiError(err);
    return NextResponse.json({ error }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = await request.json();

    // Validate input
    const result = createRecipeSchema.safeParse(input);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0].message },
        { status: 400 }
      );
    }

    const { user } = await requireApiAdminRole();
    const supabaseAdmin = getApiAdminClient();

    const { media, ...recipeData } = result.data;

    // Create the recipe
    const { data: recipe, error: recipeError } = await supabaseAdmin
      .from('recipes')
      .insert({
        title: recipeData.title,
        title_es: recipeData.titleEs || null,
        title_zh: recipeData.titleZh || null,
        description: recipeData.description || null,
        description_es: recipeData.descriptionEs || null,
        description_zh: recipeData.descriptionZh || null,
        ingredients: recipeData.ingredients || [],
        instructions: recipeData.instructions || [],
        prep_time_minutes: recipeData.prepTimeMinutes || null,
        cook_time_minutes: recipeData.cookTimeMinutes || null,
        servings: recipeData.servings || null,
        source_url: recipeData.sourceUrl || null,
        source_name: recipeData.sourceName || null,
        notes: recipeData.notes || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (recipeError || !recipe) {
      console.error('Error creating recipe:', recipeError);
      return NextResponse.json({ error: 'Failed to create recipe' }, { status: 500 });
    }

    // Insert media if provided
    if (media && media.length > 0) {
      const mediaInserts = media.map((m, index) => ({
        recipe_id: recipe.id,
        media_type: m.mediaType,
        storage_type: m.storageType,
        url: m.url,
        title: m.title || null,
        file_name: m.fileName || null,
        file_size: m.fileSize || null,
        mime_type: m.mimeType || null,
        is_hero: m.isHero || index === 0, // First media is hero by default
        sort_order: index,
        created_by: user.id,
      }));

      const { error: mediaError } = await supabaseAdmin
        .from('recipe_media')
        .insert(mediaInserts);

      if (mediaError) {
        console.error('Error creating recipe media:', mediaError);
        // Recipe was created, but media failed - don't fail the whole request
      }
    }

    return NextResponse.json({ id: recipe.id }, { status: 201 });
  } catch (err) {
    const { error, status } = handleApiError(err);
    return NextResponse.json({ error }, { status });
  }
}
