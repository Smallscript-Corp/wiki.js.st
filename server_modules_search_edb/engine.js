/* global WIKI */

module.exports = {
  activate() {
    // not used
  },
  deactivate() {
    // not used
  },
  /**
   * INIT
   */
  async init() {
    const knex = WIKI.models.knex;
    const [{fCreateTable}] = await knex.raw(`
      SELECT (count(*) == 0) as fCreateTable
      FROM sqlite_master
      WHERE name == 'pages_ft' AND type == 'table'`);
    if(fCreateTable) {
      console.log(`Edges-EDB: DbQuery CREATE pages_ft`);
      const pages_ft_create = await knex.raw(`
        CREATE VIRTUAL TABLE IF NOT EXISTS pages_ft
        USING fts5(id UNINDEXED, path, title, description, pgcontent, tags, localeCode UNINDEXED)`);
      const insert_into_pages_ft = await knex.raw(`
        INSERT INTO pages_ft (id, path, title, description, pgcontent, tags, localeCode)
        SELECT id, path, title, description, content, '', 'en' from pages`);
    }
    const insert_pages_ft = await knex.raw(`
      CREATE TRIGGER IF NOT EXISTS insert_pages_ft
        AFTER INSERT ON pages
      BEGIN
        INSERT INTO pages_ft (id, path, title, description, pgcontent, tags, localeCode)
        VALUES (NEW.id, NEW.path, NEW.title, NEW.description, NEW.content, '', 'en');
      END`);
    const update_pages_ft = await knex.raw(`
      CREATE TRIGGER IF NOT EXISTS update_pages_ft
        AFTER UPDATE ON pages
      BEGIN
        UPDATE pages_ft
        SET
          path = NEW.path,
          title = NEW.title,
          description = NEW.description,
          pgcontent = NEW.content,
          tags = '',
          localeCode = 'en'
        WHERE id == NEW.id;
      END;`);
    const delete_pages_ft = await knex.raw(`
      CREATE TRIGGER IF NOT EXISTS delete_pages_ft
        AFTER DELETE ON pages
      BEGIN
        DELETE FROM pages_ft
        WHERE id == NEW.id;
      END`);
  },
  /**
   * QUERY
   *
   * @param {String} q Query
   * @param {Object} opts Additional options
   */
  async query(q, opts) {
    const knex = WIKI.models.knex; let results;
    if(true) {
      //🔰 We could use ‹q› or ‹opts›
      //｢😈 beware of escaping issues w/inline knex-query vs direct sql-param passing｣
      results = await knex.raw(`
      SELECT title, description, path, '' as tags, id, 'en' as locale
        FROM pages_ft
        WHERE pages_ft MATCH '${q}'
        ORDER BY bm25(pages_ft,10,5,2)
        LIMIT ${WIKI.config.search.maxHits}`);
    }
    else {
      results = await WIKI.models.pages.query()
        .column('pages.id', 'title', 'description', 'path', 'localeCode as locale')
        .withGraphJoined('tags') // Adding page tags since they can be used to check resource access permissions
        .modifyGraph('tags', builder => {
          builder.select('tag')
        })
        .where(builder => {
          builder.where('isPublished', true)
          if (opts.locale) {
            builder.andWhere('localeCode', opts.locale)
          }
          if (opts.path) {
            builder.andWhere('path', 'like', `${opts.path}%`)
          }
          builder.andWhere(builderSub => {
            if (WIKI.config.db.type === 'postgres') {
              builderSub.where('title', 'ILIKE', `%${q}%`)
              builderSub.orWhere('description', 'ILIKE', `%${q}%`)
              builderSub.orWhere('path', 'ILIKE', `%${q.toLowerCase()}%`)
            } else {
              builderSub.where('title', 'LIKE', `%${q}%`)
              builderSub.orWhere('description', 'LIKE', `%${q}%`)
              builderSub.orWhere('path', 'LIKE', `%${q.toLowerCase()}%`)
            }
            const client = this?.client;
          })
        })
        .limit(WIKI.config.search.maxHits);
    }
    const result = {
      results,
      suggestions: [],
      totalHits: results.length
    };
    // console.log(`Edges-EDB: DbQuery results`,result);
    return result
  },
  pgRrecFromPage(page) {
    const knex = WIKI.models.knex;
    const {id, path, title, description, safeContent, localeCode, tags} = page;
    const pg_rec = {id, path, title, description, safeContent, localeCode, tags};
    return pg_rec;
  },
  /**
   * CREATE
   *
   * @param {Object} page Page to create
   */
  async created(page) {
    // console.log(`Edges-EDB: DbQuery created`, module.exports.pgRrecFromPage(page));
  },
  /**
   * UPDATE
   *
   * @param {Object} page Page to update
   */
  async updated(page) {
    // console.log(`Edges-EDB: DbQuery updated`, module.exports.pgRrecFromPage(page));
  },
  /**
   * DELETE
   *
   * @param {Object} page Page to delete
   */
  async deleted(page) {
    // console.log(`Edges-EDB: DbQuery deleted`, module.exports.pgRrecFromPage(page));
  },
  /**
   * RENAME
   *
   * @param {Object} page Page to rename
   */
  async renamed(page) {
    // console.log(`Edges-EDB: DbQuery renamed`, module.exports.pgRrecFromPage(page));
  },
  /**
   * REBUILD INDEX
   */
  async rebuild() {
    const knex = WIKI.models.knex;
    console.log(`Edges-EDB: DbQuery rebuild`);
    const pages_ft_drop = await knex.raw(`DROP TABLE IF EXISTS pages_ft`);
    await module.exports.init.call(this);
  }
}
