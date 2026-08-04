# StatCourt — הוראות הפעלה

## שלב 1: יצירת פרויקט Supabase (חינם)

1. גש ל-https://supabase.com ולחץ **Start your project**.
2. הירשם עם אימייל או GitHub (בלי כרטיס אשראי).
3. לחץ **New Project**, תן שם (למשל `statcourt`), בחר סיסמה למסד הנתונים (שמור אותה בצד), ובחר אזור קרוב אליך (למשל Frankfurt).
4. המתן דקה-שתיים עד שהפרויקט יוקם.

## שלב 2: יצירת הטבלאות

1. בתפריט הצד, לחץ על **SQL Editor**.
2. לחץ **New query**, הדבק את כל הקוד הבא, ולחץ **Run**:

```sql
-- טבלת קליפים
create table clips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  youtube_url text not null,
  video_id text not null,
  title text,
  created_at timestamptz default now()
);

-- טבלת הערות/סטטיסטיקות
create table notes (
  id uuid primary key default gen_random_uuid(),
  clip_id uuid references clips on delete cascade not null,
  user_id uuid references auth.users not null,
  note_text text,
  ft_made int, ft_att int,
  paint_made int, paint_att int,
  mid_made int, mid_att int,
  three_made int, three_att int,
  turnovers int,
  assists int,
  rebounds int,
  defense_rating int,
  efficiency int,
  created_at timestamptz default now()
);

-- אבטחה: כל משתמש רואה ועורך רק את הנתונים שלו
alter table clips enable row level security;
alter table notes enable row level security;

create policy "clips_select_own" on clips for select using (auth.uid() = user_id);
create policy "clips_insert_own" on clips for insert with check (auth.uid() = user_id);
create policy "clips_update_own" on clips for update using (auth.uid() = user_id);
create policy "clips_delete_own" on clips for delete using (auth.uid() = user_id);

create policy "notes_select_own" on notes for select using (auth.uid() = user_id);
create policy "notes_insert_own" on notes for insert with check (auth.uid() = user_id);
create policy "notes_update_own" on notes for update using (auth.uid() = user_id);
create policy "notes_delete_own" on notes for delete using (auth.uid() = user_id);
```

זה יוצר את שתי הטבלאות ומוודא שכל משתמש רואה **רק** את הנתונים שלו, גם אם בעתיד יצטרפו עוד אנשים לאפליקציה.

## שלב 3: כיבוי אימות אימייל (רשות, מומלץ להתחלה)

כברירת מחדל Supabase שולח מייל אישור בהרשמה. אם אתה רוצה להירשם ולהתחבר מיד בלי לאמת מייל (נוח לבדיקות):

1. לך ל-**Authentication → Providers → Email**.
2. כבה את **Confirm email**.
3. שמור.

(אפשר להדליק את זה בחזרה בעתיד אם תרצה יותר אבטחה.)

## שלב 4: העתקת הפרטים לקוד

1. לך ל-**Settings → API**.
2. העתק את **Project URL** ואת **anon public key**.
3. פתח את הקובץ `config.js` שקיבלת, והדבק אותם במקום המתאים:

```js
export const SUPABASE_URL = "https://xxxxxxxx.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOi...";
```

## שלב 5: העלאה ל-GitHub Pages (חינם)

1. צור חשבון ב-https://github.com אם אין לך.
2. צור **repository** חדש (למשל בשם `statcourt`), ציבורי.
3. העלה אליו את כל הקבצים: `index.html`, `styles.css`, `app.js`, `i18n.js`, `config.js` (עם הפרטים שמילאת).
4. בתוך ה-repository, לך ל-**Settings → Pages**.
5. תחת **Branch**, בחר `main` ותיקיית `/root`, ולחץ **Save**.
6. אחרי דקה-שתיים תקבל קישור כמו `https://<שם-המשתמש>.github.io/statcourt/` - זה האתר החי שלך!

## הערות חשובות

- ה-**anon key** לא סודי כמו סיסמה — הוא מיועד בדיוק לשימוש כזה בצד הלקוח (כל האבטחה האמיתית נשמרת ב-RLS policies שיצרת בשלב 2).
- בפרויקט החינמי של Supabase, אם לא משתמשים בו 7 ימים ברצף הוא "נרדם" — זה נפתר אוטומטית בביקור הראשון אחרי זה (לוקח כמה שניות).
- אם תרצה בעתיד שכמה חברי קבוצה ישתפו נתונים ביניהם (לא רק כל אחד רואה את שלו), אפשר להוסיף את זה — רק תגיד לי.
