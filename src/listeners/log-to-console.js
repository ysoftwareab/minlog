import _ from 'lodash-firecloud';
import moment from 'moment';

let _levelToConsoleFun = function({level, levels}) {
  if (_.isString(level)) {
    // eslint-disable-next-line prefer-destructuring
    level = levels[level];
  }

  if (_.inRange(level, 0, levels.warn)) {
    return 'error';
  } else if (_.inRange(level, levels.warn, levels.info)) {
    return 'warn';
  } else if (_.inRange(level, levels.info, levels.debug)) {
    return 'info';
  } else if (_.inRange(level, levels.debug, levels.trace)) {
    // return 'debug';
    // console.debug doesn't seem to print anything,
    // but console.debug is an alias to console.log anyway
    return 'log';
  } else if (level === levels.trace) {
    return 'trace';
  }

  return 'log';
};

/*
cfg has 2 properties
- contextId (optional, default to 'top' or '?')
  An identifier for the current "context".
- level (optional, defaults to trace)
  Any log entry less important that cfg.level is ignored.
*/

export let logToConsole = function(cfg = {}) {
  let isBrowser = typeof window !== 'undefined';
  let contextId = '?';
  let hasCssSupport = false;

  if (isBrowser) {
    if (window.parent === window) {
      contextId = 'top';
    }
    hasCssSupport = true;
  }

  _.defaults(cfg, {
    contextId,
    level: 'trace'
  });

  let maybeCss = function(css) {
    return hasCssSupport ? css : '';
  };

  return async function({entry, logger, rawEntry}) {
    if (_.filter(rawEntry._args).length === 1 && rawEntry._args[0]._babelSrc) {
      return;
    }

    if (logger.levelIsBeyondGroup(entry._level, cfg.level)) {
      return;
    }

    let now = moment(entry._time.stamp).utcOffset(entry._time.utc_offset).toISOString();
    let levelName = logger.levelToLevelName(entry._level);
    let formattedLevelName = _.padStart(_.toUpper(levelName), '5');
    let consoleFun = _levelToConsoleFun({
      level: entry._level,
      levels: logger.levels
    });

    let color = '';
    switch (consoleFun) {
    case 'log':
    case 'info':
    case 'trace':
      color = maybeCss('color: dodgerblue');
      break;
    default:
    }

    let prefixFormat = '%c%s %c%s%c';
    if (!hasCssSupport) {
      prefixFormat = _.replace(prefixFormat, /%c/g, hasCssSupport ? '%c' : '%s');
    }
    let prefixArgs = [
      maybeCss(color),
      now,
      maybeCss('font-weight: bold'),
      formattedLevelName,
      maybeCss(color)
    ];

    let src = '';
    if (entry._babelSrc) {
      src = _.merge({}, entry._src, entry._babelSrc);
      src = ` @webpack:///./${src.file}:${src.line}:${src.column}${src.function ? ` in ${src.function}()` : ''}`;
    } else if (entry._src) {
      src = entry._src;
      src = ` ${src.file}:${src.line}:${src.column}${src.function ? ` in ${src.function}()` : ''}`;
    }

    let context = {
      window,
      documentElement: window.document.documentElement
    };

    let srcFormat = '%s in the %s context';
    let srcArgs = [
      src,
      cfg.contextId
    ];

    let msgFormat = '';
    let msgArgs = [];
    if (entry.msg) {
      let {
        _duration: duration,
        msg
      } = entry;
      if (duration) {
        msg = `${msg} - took ${duration.ms} ms (${duration.human})`;
      }

      msgFormat = '\n%s';
      msgArgs = [
        msg
      ];
    }

    let extraFormat = '';
    let extraArgs = [];

    let extra = _.omit(rawEntry, [
      '_args',
      '_babelSrc',
      '_duration',
      '_level',
      '_src',
      '_time',
      '_timeEnd',
      '_timeStart',
      'contextId',
      'msg'
    ]);
    _.merge(extra, context);

    // devTools console sorts keys when object is expanded
    extra = _.toPairs(extra);
    extra = _.sortBy(extra, 0);
    extra = _.fromPairs(extra);

    // devTools collapses objects with 'too many' keys,
    // so we output objects with only one key
    _.forEach(extra, function(value, key) {
      extraArgs.push('\n');
      extraArgs.push({[key]: value});
    });

    let format = `${prefixFormat}${srcFormat}:${msgFormat}${extraFormat}`;
    let vars = [
      ...prefixArgs,
      ...srcArgs,
      ...msgArgs,
      ...extraArgs
    ];

    // eslint-disable-next-line no-console
    console[consoleFun](format, ...vars);
  };
};

export default logToConsole;
