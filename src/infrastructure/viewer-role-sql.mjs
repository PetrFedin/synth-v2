/**
 * Колонка «под какой ролью читатель видит эту строку» — роль в организации-владельце строки.
 *
 * Читатели PostgreSQL отбирают строки по членству, но роль у каждой строки своя (один человек —
 * финансист в одном бренде и производство в другом), поэтому скрывать стоимость нужно по роли
 * строки, а не «вообще» по человеку. Первичный ключ memberships — (organisation_id, user_id), так
 * что подзапрос возвращает не больше одной роли.
 */
export function viewerRoleColumn(actorParameter, brandColumn) {
  return `(SELECT viewer.role FROM memberships AS viewer
            WHERE viewer.user_id = ${actorParameter}
              AND viewer.organisation_id = ${brandColumn}
              AND viewer.status = 'active') AS viewer_role`;
}
