import { NextRequest, NextResponse } from 'next/server';
import { updateRecipeSchema } from '@/lib/validators/recipe';
import { getApiAdminClient, getApiAuthUser, requireApiAdminRole, handleApiError } from '@/lib/supabase/api-helpers';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getApiAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const supabaseAdmin = getApiAdminClient();

    const { data: recipe, error } = await supabaseAdmin
      .from('recipes')
      .select(`
        *,
        media:recipe_media(*)
      `)
      .eq('id', id)
      .single();

    if (error || !recipe) {
      return NextResponse.json({ error: 'Recipe not found' }, { status: 404 });
    }

    // Transform snake_case to camelCase
    const transformedRecipe = {
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
    };

    return NextResponse.json(transformedRecipe);
  } catch (err) {
    const { error, status } = handleApiError(err);
    return NextResponse.json({ error }, { status });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const input = await request.json();

    // Validate input
    const result = updateRecipeSchema.safeParse(input);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0].message },
        { status: 400 }
      );
    }

    const { user } = await requireApiAdminRole();
    const supabaseAdmin = getApiAdminClient();

    const { media, ...recipeData } = result.data;

    // Build update object, only including fields that were provided
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (recipeData.title !== undefined) updateData.title = recipeData.title;
    if (recipeData.titleEs !== undefined) updateData.title_es = recipeData.titleEs;
    if (recipeData.titleZh !== undefined) updateData.title_zh = recipeData.titleZh;
    if (recipeData.description !== undefined) updateData.description = recipeData.description;
    if (recipeData.descriptionEs !== undefined) updateData.description_es = recipeData.descriptionEs;
    if (recipeData.descriptionZh !== undefined) updateData.description_zh = recipeData.descriptionZh;
    if (recipeData.ingredients !== undefined) updateData.ingredients = recipeData.ingredients;
    if (recipeData.instructions !== undefined) updateData.instructions = recipeData.instructions;
    if (recipeData.prepTimeMinutes !== undefined) updateData.prep_time_minutes = recipeData.prepTimeMinutes;
    if (recipeData.cookTimeMinutes !== undefined) updateData.cook_time_minutes = recipeData.cookTimeMinutes;
    if (recipeData.servings !== undefined) updateData.servings = recipeData.servings;
    if (recipeData.sourceUrl !== undefined) updateData.source_url = recipeData.sourceUrl || null;
    if (recipeData.sourceName !== undefined) updateData.source_name = recipeData.sourceName;
    if (recipeData.notes !== undefined) updateData.notes = recipeData.notes;

    // Update the recipe
    const { error: recipeError } = await supabaseAdmin
      .from('recipes')
      .update(updateData)
      .eq('id', id);

    if (recipeError) {
      console.error('Error updating recipe:', recipeError);
      return NextResponse.json({ error: 'Failed to update recipe' }, { status: 500 });
    }

    // Handle media updates if provided
    if (media !== undefined) {
      // Delete existing media
      await supabaseAdmin
        .from('recipe_media')
        .delete()
        .eq('recipe_id', id);

      // Insert new media
      if (media.length > 0) {
        const mediaInserts = media.map((m, index) => ({
          recipe_id: id,
          media_type: m.mediaType,
          storage_type: m.storageType,
          url: m.url,
          title: m.title || null,
          file_name: m.fileName || null,
          file_size: m.fileSize || null,
          mime_type: m.mimeType || null,
          is_hero: m.isHero || index === 0,
          sort_order: index,
          created_by: user.id,
        }));

        const { error: mediaError } = await supabaseAdmin
          .from('recipe_media')
          .insert(mediaInserts);

        if (mediaError) {
          console.error('Error updating recipe media:', mediaError);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const { error, status } = handleApiError(err);
    return NextResponse.json({ error }, { status });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await requireApiAdminRole();
    const supabaseAdmin = getApiAdminClient();

    // Delete the recipe (media will be cascade deleted)
    const { error } = await supabaseAdmin
      .from('recipes')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting recipe:', error);
      return NextResponse.json({ error: 'Failed to delete recipe' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const { error, status } = handleApiError(err);
    return NextResponse.json({ error }, { status });
  }
}
