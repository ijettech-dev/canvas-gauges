/**
 * Canv-Gauge Dev Tasks Runner
 *
 * @author Mykhailo Stadnyk <mikhus@gmail.com>
 */
const gulp = require('gulp');
const usage = require('gulp-help-doc');
const browserify = require('browserify');
const babelify = require('babelify');
const source = require('vinyl-source-stream');
const buffer = require('vinyl-buffer');
const merge = require('utils-merge');
const rename = require('gulp-rename');
const sourcemaps = require('gulp-sourcemaps');
const uglify = require('gulp-uglify');
const rimraf = require('rimraf');
const esdoc = require('gulp-esdoc');
const eslint = require('gulp-eslint');
const gzip = require('gulp-gzip');
const KarmaServer = require('karma').Server;
const wdio = require('gulp-wdio');
const gutil = require('gulp-util');
const chalk = require('chalk');
const http = require('https');
const fs = require('fs');

/**
 * Displays this usage information.
 *
 * @task {help}
 */
gulp.task('help', () => usage(gulp));

/**
 * Clean-ups files from previous build.
 *
 * @task {clean}
 */
gulp.task('clean', (done) => {
    rimraf('gauge.js', () =>
    rimraf('gauge.min.js', () =>
    rimraf('gauge.min.js.map', () =>
    rimraf('gauge.min.js.gz', done))));
});

/**
 * Automatically generates API documentation for this project
 * from a source code.
 *
 * @task {doc}
 */
gulp.task('doc', () => {
    gulp.src('./lib')
        .pipe(esdoc({ destination: './docs' }));
});

/**
 * Transpiles, combines and minifies JavaScript code.
 *
 * @task {build}
 */
gulp.task('build', ['clean'], () => {
    //noinspection JSCheckFunctionSignatures
    return browserify(['lib/babelHelpers.js', 'lib/Gauge.js'])
        .transform(babelify, {
            presets: ['es2015'],
            plugins: ['external-helpers-2']
        })
        .bundle()
        .on('error', function(err) {
            gutil.log(err);
            this.emit('end');
        })
        .pipe(source('gauge.js'))
        //.pipe(gulp.dest('.'))
        .pipe(buffer())
        .pipe(rename('gauge.min.js'))
        .pipe(sourcemaps.init({ loadMaps: true }))
        .pipe(uglify())
        .pipe(sourcemaps.write('.'))
        .pipe(gulp.dest('.'));
});

gulp.task('watch', ['build'], () => {
    gulp.watch('lib/**/*.js', () => gulp.start('build'));
});

/**
 * Runs gzipping for minified file.
 *
 * @task {gzip}
 */
gulp.task('gzip', ['build'], () => {
    return gulp.src('gauge.min.js')
        .pipe(gzip({ gzipOptions: { level: 9 } }))
        .pipe(gulp.dest('.'));
});

/**
 * Performs JavaScript syntax linting checks.
 *
 * @task {lint}
 */
gulp.task('lint', () => {
    console.log(chalk.bold.green('\nStarting linting checks...\n'));

    return gulp.src([
            '**/*.js',
            '!node_modules/**',
            '!docs/**',
            '!**.min.js',
            '!coverage/**'
        ])
        .pipe(eslint())
        .pipe(eslint.format())
        .pipe(eslint.failAfterError());
});

/**
 * Runs unit tests.
 *
 * @task {test:spec}
 */
gulp.task('test:spec', ['lint'], done => {
    console.log(chalk.bold.green('Starting unit tests...'));

    let server = new KarmaServer({
        configFile: __dirname + '/karma.conf.js',
        singleRun: true
    }, () => {
        server && server.stop();
        done();
    }).start();
});

/**
 * Runs end-to-end tests.
 *
 * @task {test:e2e}
 *
 * Testing concept could be following:
 *  1. Create various gauge configuration HTML pages
 *  2. Use protractor to navigate this pages
 *  3. On each page, depending on the gauge config and screen res/dpi
 *     checking the proper pixels on canvas if them matching expected color
 *     This could be checks, for example if highlight area in this pixel is
 *     present or not, if arrow starts/ends at this point, etc.
 *     This would be valuable checks, because if something wrong happen with
 *     drawing, most probably expected pixels won't match the expected specs,
 *     so we can automatically figure something is broken.
 */
gulp.task('test:e2e', () => {
    console.log(chalk.bold.green('\nStarting end-to-end tests...\n'));

    return gulp.src('wdio.conf.js')
        .pipe(wdio({ type: 'selenium' }))
        .once('error', () => process.exit(1))
        .once('end', () => {
            if (process.env.TRAVIS) {
                setTimeout(() => process.exit(0), 500);
            }

            console.log(chalk.bold.green('Generating badge...'));

            // create badges
            let rx = new RegExp(
                '[\u001b\u009b][[()#;?]*' +
                '(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?' +
                '[0-9A-ORZcf-nqry=><]', 'g');
            let coverage = fs.readFileSync(
                    './coverage/report/coverage.txt',
                    { encoding: 'utf8' }
                )
                .replace(rx, '')
                .split(/\r?\n/)[2]
                .split(':')[1]
                .split('(')[0]
                .trim();
            let color = 'green';

            if (parseFloat(coverage) < 90) {
                color = 'red';
            }

            let url = 'https://img.shields.io/badge/coverage-' +
                coverage.replace(/%/g, '%25') +
                '-' + color + '.svg';

            http.get(url, response => {
                if ((response instanceof Error)) {
                    console.error(response);
                    process.exit(0);
                }

                response
                    .pipe(fs.createWriteStream('test-coverage.svg'))
                    .on('finish', () => process.exit(0));
            });
        });
});

/**
 * Runs all tests including end-ro-end tests as well.
 *
 * @task {test}
 */
gulp.task('test', ['test:spec'], () => gulp.start('test:e2e'));

gulp.task('default', ['help']);
