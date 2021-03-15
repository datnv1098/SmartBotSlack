exports.up = function (knex) {
  return knex.schema.table('microsoft_account', function (table) {
    table.string('mail').notNull().after('id');
  });
};

exports.down = function (knex) {
  return knex.schema.table('microsoft_account', table => {
    table.dropColumn('mail');
  })
};
