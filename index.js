var fs = require('fs');

if (!fs.existsSync('./node_modules')) {
  console.error("You must run 'npm install' before running this script");
  process.exit(1);
}

if (!fs.existsSync('./.env')) {
  fs.createReadStream('./.env.example').pipe(fs.createWriteStream('./.env'));
}

require('dotenv').config();

if (typeof process.env.API_KEY !== "string" || process.env.API_KEY.length == 0) {
  console.error("You must set API_KEY in '.env' before running this script.");
  process.exit(1);
}

var clarityboard = require('clarityboard')(process.env.API_KEY),
  moment = require('moment'),
  replace = require('replace-in-file'),
  bottleneck = require('bottleneck'),
  limiter = new bottleneck({
    minTime: 100,
    maxConcurrent: 10
  });

console.log("Generating 'My Example Dashboard'");
clarityboard.dashboards.list().then((dashboards) => {
  for(var i = 0; i < dashboards.length; i++) {
    if (dashboards[i].name == "My Example Dashboard") {
      return dashboards[i];
    }
  }

  // We didn't find our example dashboard, so lets create it
  return clarityboard.dashboards.create({name: "My Example Dashboard"});
}).then((dashboard) => {
  return generateExampleDataFor(dashboard);
});

function generateExampleDataFor(dashboard) {
  console.log("Generating 'Q&A' record group.");
  clarityboard.recordGroups.update({
    'group': 'Q&A',
    'data': {
      'Q/A': 'Answer',
      'Submitted': '2018-09-15T15:53:00',
      'Response Time': '1 Hour'
    }
  }).then((recordGroup) => {
    console.log("Generating reports for 'My Example Dashboard'");
    return Promise.all([
      clarityboard.reports.create({
        'dashboardId': dashboard.id,
        'name': 'Total Q&As',
        'chart': 'timeline',
        'rules': [
          {
            'type': 'record-group',
            'value': recordGroup.id,
          },
          {
            'type': 'field',
            'value': 'Q/A',
          },
          {
            'type': 'date-constraint',
            'value': 'Submitted'
          }
        ]
      }),
      clarityboard.reports.create({
        'dashboardId': dashboard.id,
        'name': 'Response Time',
        'chart': 'percentage',
        'rules': [
          {
            'type': 'record-group',
            'value': recordGroup.id,
          },
          {
            'type': 'field',
            'value': 'Response Time',
          },
          {
            'type': 'date-constraint',
            'value': 'Submitted'
          }
        ]
      })
    ]);
  })
  .then(() => {
    console.log("Creating dummy records...");
    var q_or_a = ['Question', 'Answer'],
        response_times = ['1 Hour', '2 Hours', '4 Hours'];
        end_date = moment(),
        start_date = moment(end_date.toDate()).subtract(1, 'weeks'),
        records = [];
    for(; start_date.isSameOrBefore(end_date); start_date.add(1, 'day')) {
      var create_records = Math.floor(Math.random()*50)+1;
      for (var i = 0; i < create_records; i++) {
        records.push((() => {
          var data = {
            'Q/A': q_or_a[Math.floor(Math.random()*q_or_a.length)],
            'Submitted': moment(start_date.toDate()).hour(Math.floor(Math.random() * 23)).format()
          };

          if (data['Q/A'] == "Answer") {
            data['Response Time'] = response_times[Math.floor(Math.random()*response_times.length)]
          }

          return limiter.schedule(() => {
            clarityboard.records.create({
              'group': 'Q&A',
              'data': data
            })
          });
        })());
      }
    }

    return Promise.all(records);
  }).then(() => {
    console.log("Writing example embed...");
    fs.createReadStream('./index.html.template').pipe(fs.createWriteStream('./index.html'));
    const options = {
      files: './index.html',
      from: /\<\!\-\- Insert Dashboard Embed Code Here \-\-\>/g,
      to: dashboard.embedCode,
    };
    return replace(options);
  }).then(() => {
    console.log("View your dashboard on https://www.clarityboard.com/dashboards/"+dashboard.id+" or open file://"+__dirname+"/index.html in your browser.");
    return;
  });
}
