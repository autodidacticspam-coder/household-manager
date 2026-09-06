import { describe, expect, it } from 'vitest';
import { suggestMeals, type MealRequestSignal } from './meal-suggestions';

const now = new Date('2026-09-06T12:00:00Z');
const request = (name: string, status = 'pending', completed: string | null = null): MealRequestSignal => ({ food_name: name, status, completed_at: completed, requested_by: 'person-1' });

describe('meal suggestions', () => {
  it('prioritizes pending requests, respects approved aliases, and shows evidence counts', () => {
    const result = suggestMeals({ now, ratings: [{ menu_item:'Soup',rating:10,rated_by:'a' }], requests:[request('Fried rice'),request('炒饭')], merges:[{ sourceName:'Fried rice',canonicalName:'炒饭' }] });
    expect(result[0]).toMatchObject({ name:'炒饭', pendingCount:2, requestCount:2, requesterCount:1, ratingCount:0, lastCompletedAt:null });
    expect(result[1]).toMatchObject({ name:'Soup', averageRating:10, ratingCount:1, raterCount:1 });
  });
  it('allows a recent repeat only when explicitly requested and ignores declined requests', () => {
    const result = suggestMeals({ now, ratings:[{ menu_item:'Soup',rating:9,rated_by:'a' }], requests:[request('Soup','completed','2026-09-05T12:00:00Z'),request('Rice','completed','2026-09-05T12:00:00Z'),request('Rice'),request('Steak','declined')] });
    expect(result.map(item=>item.name)).toEqual(['Rice']);
    expect(result[0].recentlyCompleted).toBe(true);
  });
  it('does not invent completion history from a plan, a missing timestamp, or an invalid date', () => {
    const result = suggestMeals({ now, ratings:[], requests:[request('Noodles','completed'),request('Noodles','completed','bad date'),request('Noodles','completed','2099-01-01')] });
    expect(result[0]).toMatchObject({ name:'Noodles',lastCompletedAt:null,recentlyCompleted:false });
    expect(suggestMeals({ ratings:[],requests:[],now })).toEqual([]);
  });
  it('balances people when ranking and applies explicit tag selections before limiting', () => {
    const ratings = [...Array.from({length:20},()=>({ menu_item:'One person favorite',rating:10,rated_by:'a' })),{ menu_item:'One person favorite',rating:2,rated_by:'b' },...['a','b','c'].map(rated_by=>({menu_item:'Shared favorite',rating:9,rated_by}))];
    expect(suggestMeals({ now,ratings,requests:[] })[0].name).toBe('Shared favorite');
    expect(suggestMeals({ now,ratings,requests:[request('Other')],allowedNames:['Shared favorite'],limit:1 }).map(item=>item.name)).toEqual(['Shared favorite']);
    expect(suggestMeals({ now,ratings,requests:[],allowedNames:[] })).toEqual([]);
  });

  it('leaves space for favorites when there are many pending requests', () => {
    const result = suggestMeals({ now, ratings:['A','B','C'].map(name=>({menu_item:name,rating:9,rated_by:'a'})), requests:Array.from({length:8},(_,index)=>request(`Requested ${index}`)) });
    expect(result).toHaveLength(6);
    expect(result.filter(item=>item.pendingCount>0)).toHaveLength(3);
    expect(result.slice(3).map(item=>item.name)).toEqual(['A','B','C']);
  });
});
