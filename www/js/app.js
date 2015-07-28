/*

The MIT License (MIT)

Copyright (c) 2015 Jim Blaney

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

*/

// creates a sorting function that uses a delegate function to derive the sorting key value
function arraySorter(keyDelegate) {

  return function(lhs, rhs) {

    lhs = keyDelegate(lhs);
    rhs = keyDelegate(rhs);

    if (lhs < rhs) { return -1;}
    else if (lhs > rhs) { return 1; }
    else { return 0; }
  };
}

// function to calculate the checksum for the logger message
// assumes that the leading '$' and trailing '*' have been stripped off before calling
function checksum(str) {

  str = str.replace(/(\r|\n)/g, ""); // HACK

  var chksum = 0;
  for(var i = 0; i < str.length; i++) {
    chksum = chksum ^ str.charCodeAt(i);
  }

  return chksum;
}

// ArrayBuffer -> string
function ab2str(buf) {

  return String.fromCharCode.apply(null, new Uint8Array(buf));
}

// string -> ArrayBuffer
function str2ab(str) {

  var buf = new ArrayBuffer(str.length);
  var bufView = new Uint8Array(buf);
  for (var i=0, strLen=str.length; i<strLen; i++) {
    bufView[i] = str.charCodeAt(i);
  }
  return buf;
}

// ArrayBuffer -> float
function ab2float(ab) {

  var a = new Float32Array(ab);
  return a[0];
}

// ArrayBuffer -> int
function ab2int(ab) {

  var a = new Int32Array(ab);
  return a[0];
}

// celsius -> fahrenheit
function c2f(c) {

  return c * (9/5) + 32;
}

// string padding (left)
function pad(str, len, pad) {

  str = str.toString();
  while (str.length < len) {
    str = pad + str;
  }

  return str;
}

// date -> string (w3c)
function date2str(date) {

  return pad(date.getFullYear(), 4, "0") + "-" +
         pad(date.getMonth() + 1, 2, "0") + "-" +
         pad(date.getDate(), 2, "0") + "T" +
         pad(date.getHours(), 2, "0") + ":" +
         pad(date.getMinutes(), 2, "0") + ":" +
         pad(date.getSeconds(), 2, "0") + "Z";
}

// date -> string (YYYYMMDDHHMM)
function date2stamp(date) {

  return pad(date.getFullYear(), 4, "0") +
         pad(date.getMonth() + 1, 2, "0") +
         pad(date.getDate(), 2, "0") +
         pad(date.getHours(), 2, "0") +
         pad(date.getMinutes(), 2, "0");
}

var app = {

  // command names that are sent to the temperature logger over bluetooth
  commands: {
    ECHO: "Echo",
    SET_TIME: "SetTime",
    GET_OBSERVATION: "GetObservation",
    XFER_DATA: "TransferData",
    XFER_DATA2: "ContinueData"
  },

  // variables used to maintain application state
  _fileSystem: null,
  _rootDir: null,

  apiUrl: "http://boost.hood.edu/boost/api/",

  // the length of time to poll for rfduino devices
  pollLength: 5, // seconds

  // the quota size of the filesystem to request
  fileSystemRequestSize: 1024 * 1024 * 5, // 5MB

  addFile: function(file) {

    $(".no-file", "#file-list").remove();

    $("#file-list").append(
      "<li class='table-view-cell file' data-file-name='" + file.name + "'>" +
      file.name +
      "<button class='btn btn-link'><span class='icon icon-more-vertical'></span></button></li>"
    );

    $("li[data-file-name='" + file.name + "'] button").on("click", function() {
      app.openFile(file);
    });
  },

  // bind DEVICE events
  bindEvents: function() {

    document.addEventListener('deviceready', this.onDeviceReady, false);
  },

  bindTrivialEvents: function() {

    $("input[name='username']", "#loginform").val(localStorage.getItem("boost_user"));
    $("input[name='password']", "#loginform").val(localStorage.getItem("boost_pass"));
    
    // attach the graph view button click handlers
    $("button#btndeletefile").on("click", app.deleteFile);
    $("button#btnsendfile").on("click", app.sendFile);
    $("button#btnuploadfile").on("click", function() {
      $("#loginmodal").addClass("active");
    });

    $("button#btnLogin").on("click", app.doLogin);
    $("button#btnRegistration").on("click", function() {
      $("#registermodal").addClass("active");
    });
    $("button#btnRegister").on("click", app.doRegistration);

    // open http:// links in the system browser (not this application)
    $("a.website").on("click", function(event) {
      event.preventDefault();
      open($(this).attr("href"), "_system");
    });

    // for android devices, a little extra help is needed to dial
    if (device.platform !== "iOS") {
      $("a.telephone").on("click", function() {
        plugins.CallNumber.callNumber(function() { }, app.onError, $(this).attr("href").replace("tel:", ""));
      });
    }

    // open mailto: links in the system application
    $("a.email").on("click", function(event) {
      event.preventDefault();
      cordova.plugins.email.open({
        to:      $(this).attr("href").replace("mailto:", "").split(";"),
        subject: "Project BOOST",
        body:    "<p>&nbsp;</p><hr><p style='color: #aaa'><em>Sent from the Project BOOST mobile application</em></p>",
        isHtml:  true
      });
    });

    $("#refresh-list-button").on("click", app.refreshDeviceList);
    $("#refresh-device-data").on("click", app.refreshDeviceData);
    $("#disconnect-button").on("click", app.disconnect);

    $("#set-device-time").on("click", function() {
      rfduino.isConnected(function() {
        var d = new Date();
        var time = Math.floor((d.getTime() + d.getTimezoneOffset() * 60 * 1000) / 1000);
        $("button.disable-on-download").prop("disabled", true);
        app.sendCommand(app.commands.SET_TIME, time, true).then(app.refreshDeviceData);
      });
    });
  },

  connect: function(device) {

    $("button[data-device-uuid='" + device.uuid + "'] .icon", "#logger-list").addClass("spinning");

    var onConnect = function() {
      $("button[data-device-uuid='" + device.uuid + "'] .icon", "#logger-list").removeClass("spinning");
      // fill in any model-specific node text
      for (var prop in device) {
        if (device.hasOwnProperty(prop)) {
          $("[data-model-device='" + prop + "']", "#devicemodal").text(device[prop]);
        }
      }

      // show the modal
      $("#devicemodal").addClass("active");

      // refresh the UI data (after a brief loading period)
      setTimeout(app.refreshDeviceData, 250);
    };

    rfduino.connect(device.uuid, onConnect, function(error) {
      app.disconnect();
      app.onError(error);
    });
  },

  deleteFile: function() {

    var file = app._currentFile;

    navigator.notification.confirm("Are you sure you want to delete this file?", function(confirm) {

      if (confirm !== 1) {
        return; // don't do anything if the user didn't press "OK"
      }

      file.remove(function() {
        app._currentFile = null;

        // remove the file from the list of files
        $("li[data-file-name='" + file.name + "']").remove();

        // close the graph view
        $("#graphmodal").removeClass("active");
      }, app.onError);
    }, "Delete File");
  },

  disconnect: function() {

    var closeModal = function() {
      $("#devicemodal").removeClass("active");
    };

    rfduino.isConnected(function() {
      rfduino.disconnect(closeModal, app.onError);
    });
  },

  fixAppleStatusBar: function() {

    // ios8 has problems with status bar title elements, here's the fix
    if (device.platform === "iOS") {
      StatusBar.overlaysWebView( false );
      StatusBar.backgroundColorByHexString('#ffffff');
      StatusBar.styleDefault();
    }
  },

  initDownload: function() {

    var data_len = 0;
    var data_length = 0;
    var the_file = null;

    var xfer_units = "B"
    var xfer_scale = 1.0;

    var data_buffer = "";

    var cont = function(data) {

      data = data || "";
      data_len -= data.length;

      data_buffer += data;

      // update the download button with completion status (btyes / total - percent)
      $("#get-device-data").text(((data_length - data_len) / xfer_scale).toFixed(1) +
                                 " of " +
                                 (data_length / xfer_scale).toFixed(1) +
                                 xfer_units +
                                 " - " +
                                 Math.floor((((data_length - data_len) * 100) / data_length)).toFixed(0) +
                                 "%");

      if (data_len > 0) {
        app.sendCommand(app.commands.XFER_DATA2, "", true).then(cont, app.onError);
      } else {
        the_file.createWriter(function(writer) {
          var blob = new Blob([data_buffer], { type: "text/plain" });
          writer.onwriteend = function() {
            $("#get-device-data").text("Download Data");
            $("button.disable-on-download").prop("disabled", false);
            app.addFile(the_file);
            app.disconnect();
            app.openFile(the_file);
          };
          writer.write(blob);
        });
      }

      // this snippet remains as a warning to those who assume dragons be not here...
      // iOS seems to hit "a" limit at ~19.4KB transferred. i wasn't sure if
      // it was because of a recursion limit or extent of memory (lots of objects
      // coming in and out of scope here), so I rewrote it (as the above portion)
      // because I figured, "what's the harm in having a REALLY big, highly
      // volatile, [immutable] string?" lo and behold, it worked. I should also
      // mention that at the same time, the RFduino I was using crapped out and
      // I replaced it with a newer one. I didn't investigate the coincidence,
      // since it now works.
      /*the_file.createWriter(function(writer) {
        writer.seek(writer.length);
        var blob = new Blob([data], { type: "text/plain" });
        writer.onwriteend = function() {
          if (data_len > 0) {
            app.sendCommand(app.commands.XFER_DATA2, "", true).then(cont, app.onError);
          } else {
            $("#get-device-data").text("Download Data");
            $("button.disable-on-download").prop("disabled", false);
            app.addFile(the_file);
            app.disconnect();
            app.openFile(the_file);
          }
        };
        writer.write(blob);
      });*/
    };

    $("#get-device-data").on("click", function() {
      //rfduino.isConnected(function() {

        $("button.disable-on-download").prop("disabled", true);
        app.sendCommand(app.commands.XFER_DATA, "", true)
          .then(function(data) {

            data_length = data_len = parseInt(data, 10);

            if (data_length > 1024 * 1024) { // MB
              xfer_scale = 1024.0 * 1024.0;
              xfer_units = "MB";
            } else if (data_length > 1024) {
              xfer_scale = 1024.0;
              xfer_units = "KB";
            }

            $("#get-device-data").text("0.0 of " + (data_length / xfer_scale).toFixed(1) + xfer_units + " - 0%");

            if (data_len === 0) {
              navigator.notification.alert("No data to download", function() {}, "Download");
              return;
            }

            var deviceId = $("li span[data-model-device='name']", "#devicemodal").text();

            app._rootDir.getFile(deviceId + "-" + date2stamp(new Date()) + ".txt", { create: true }, function(file) {
              the_file = file;
              app.sendCommand(app.commands.XFER_DATA2, "", true).then(cont, app.onError);
            });
          }, app.onError);
      //});
    });
  },

  // request the filesystem
  initFileSystem: function() {
    console.log("initFileSystem");
    
    requestFileSystem(LocalFileSystem.PERSISTENT, app.fileSystemRequestSize, function(fs) {

      // retain reference to the file system root
      app._fileSystem = fs;

      // build the /edu/hood/boost folder path
      fs.root.getDirectory("edu", { create: true }, function(dir) {
        dir.getDirectory("hood", { create: true }, function (dir) {
          dir.getDirectory("boost", { create: true }, function (dir) {

            // retain reference to the edu/hood/boost folder entry
            app._rootDir = dir;

            // read the files currently in the directory
            var reader = dir.createReader();
            reader.readEntries(function (files) {

              files = [].concat(files);

              // ignore directories (there shouldn't be any...)
              files = files.filter(function (file) {
                return !file.isDirectory;
              });

              if (!files.length) {
                // if no files, add an entry so that the user is aware of such
                $("#file-list").append(
                  "<li class='table-view-cell no-file'>No files found</li>");
              } else {
                // add the file to the list of files
                files.forEach(app.addFile);
              }
            }, app.onError);
          }, app.onError);
        }, app.onError);
      }, app.onError);
    }, app.onError);
  },

  // init function, called immediately (below)
  initialize: function() {

    this.bindEvents();
  },

  injectDeviceStylesheet: function() {

    // add the device-specific (ios, android) stylesheet for ratchet to the HEAD
    $("head").append("<link rel='stylesheet' type='text/css' href='ratchet/css/ratchet-theme-" +
                      device.platform.toLowerCase() + ".min.css'>");
  },

  onDeviceReady: function() {

    // perform ui-related functions first
    app.injectDeviceStylesheet();
    app.fixAppleStatusBar();

    app.bindTrivialEvents();

    app.initDownload();
    
    app.refreshDeviceList();
    
    app.initFileSystem();
    
    Highcharts.setOptions({
      global: {
        getTimezoneOffset: function() {
          return new Date().getTimezoneOffset() * 2; // display local times on the graph
        }
      }
    });
    
  },

  onDiscoverDevice: function(device) {

    // iOS fix
    device.uuid = device.uuid || device.id;

    // create the item in the list for the device
    $("#logger-list").append(
      "<li class='table-view-cell device'>" + device.name +
      " <button data-device-uuid='" + device.uuid +
      "' class='btn btn-link manage'><span class='icon icon-more-vertical'></span></button></li>");

    // bind to the button's click event
    $("button[data-device-uuid='" + device.uuid + "']", "#logger-list").on("click", function() {
      app.connect(device);
    });
  },

  onError: function(reason) {
    console.log("ERROR");
    console.log(reason);

    navigator.notification.alert(reason, function() {}, "Error");
  },

  openFile: function(file) {

    // save reference to the current file (for send, upload, and delete button funcitonality)
    app._currentFile = file;

    // make the icon for the file spin while it is being parsed
    $("li[data-file-name='" + file.name + "'] .icon", "#file-list").addClass("spinning");

    file.file(function(file) {

      // create a FileReader to read the file
      var reader = new FileReader();

      // set the action callback
      reader.onloadend = function() {

        // get reference the to file contents
        var content = this.result;

        // begin the JSON data string
        // this had to be implemented as string -> JSON because
        // the runtime flattens multi-dimensional arrays when built dynamically
        var temp_data_str = "[";
        var batt_data_str = "[";

        // iterate through the lines
        content.split("\n").forEach(function(line) {

          // line length validation (min length is 26)
          if (line.length < 26) { // line too short = IGNORE
            return;
          }

          // message structure validation
          var tokens = line.split(/[,*]/);
          if (tokens.length !== 5) {
            return; // bad line structure = IGNORE
          }

          // checksum validation
          var reported_chksum = parseInt(line.replace(/[$].*[*](..).*/, "$1"), 16);
          var chksum = checksum(line.replace(/[$](.*)[*].*/, "$1"));
          if (chksum !== reported_chksum) {
            return; // checksum validation failed = IGNORE
          }

          // append the data to the JSON string
          temp_data_str = temp_data_str + "[" + tokens[1] + "000," + tokens[3] + "],";
          batt_data_str = batt_data_str + "[" + tokens[1] + "000," + tokens[2] + "],";
        });

        // replace the trailing comma with a closing bracket to complete the JSON
        temp_data_str = temp_data_str.replace(/,$/, "]");
        batt_data_str = batt_data_str.replace(/,$/, "]");

        // case where there is no data, fix the JSON
        if (temp_data_str.length == 1) {
          temp_data_str += "]";
        }
        if (batt_data_str.length == 1) {
          batt_data_str += "]";
        }

        // parse the JSON array
        var temp_data = JSON.parse(temp_data_str);
        var batt_data = JSON.parse(batt_data_str);

        var sorter = arraySorter(function(arr) {
          return arr[0];
        });
        temp_data.sort(sorter);
        batt_data.sort(sorter);

        // create a graph with the data
        $("#graph").highcharts("StockChart", {
          chart: {
            pinchType: "",
            zoomType: "x",
            backgroundColor: "transparent",
            plotBackgroundColor: "#fff"
          },
          credits: { enabled: false },
          rangeSelector: {
            buttons: [
              { type: "day", count: 1, text: "1d" },
              { type: "day", count: 3, text: "3d" },
              { type: "week", count: 1, text: "1w" },
              { type: "month", count: 1, text: "1m" },
              { type: "month", count: 4, text: "4m" }
            ],
            selected: 2
          },
          yAxis: [{
            labels: {
              format: '{value}°C',
              style: {
                color: Highcharts.getOptions().colors[0]
              }
            },
            title: {
              text: "Temperature (°C)",
              style: {
                color: Highcharts.getOptions().colors[0]
              }
            },
            opposite: false,
            plotLines : [{
              value : 22.2,
              color : "red",
              dashStyle : "shortdash",
              width : 1,
              label : {
                text : "22.2°C",
                style: {
                  color: "red"
                }
              }
            }]
          }, {
            labels: {
              format: '{value}V',
              style: {
                color: Highcharts.getOptions().colors[2]
              }
            },
            title: {
              text: "Power Supply (V)",
              style: {
                color: Highcharts.getOptions().colors[2]
              }
            }
          }],
          title: { text: file.name.split("-")[0] + " Observed Temperature" },
          series: [{
            name: "Temperature",
            yAxis: 0,
            data: temp_data,
            tooltip: {
              valueDecimals: 3,
              valueSuffix: "°C"
            }
          }, {
            name: "Power Supply",
            yAxis: 1,
            data: batt_data,
            tooltip: {
              valueDecimals: 3,
              valueSuffix: "V"
            },
            dashStyle: "shortdot",
            color: Highcharts.getOptions().colors[2]
          }]
        });

        // stop the file icon from spinning now that parsing is done
        $("li[data-file-name='" + file.name + "'] .icon", "#file-list").removeClass("spinning");

        // show the graph view
        $("#graphmodal").addClass("active");
      };

      // perform the read to invoke the callback
      reader.readAsText(file);
    })
  },

  refreshDeviceData: function() {

    $("#refresh-device-data .icon").addClass("spinning");

    $("button.disable-on-download").prop("disabled", true);
    app.sendCommand(app.commands.GET_OBSERVATION)
      .then(function(data) {

        $("button.disable-on-download").prop("disabled", false);
        $("#refresh-device-data .icon").removeClass("spinning");

        var observation = data;
        // $OBS,1429856136,3.121,22.287*63 // sample

        var tokens = observation.split(/[,*]/);
        // 0: $OBS
        // 1: 1429856136
        // 2: 3.121
        // 3: 22.287
        // 4: 63

        //
        // temperature
        //
        var temperature = parseFloat(tokens[3]);
        console.log(temperature + "*C");
        $("#device-temperature").html(temperature.toFixed(3) + "&deg;C / " + c2f(temperature).toFixed(3) + "&deg;F");

        //
        // battery
        //
        var batteryLevel = parseFloat(tokens[2])
        $("#device-battery").text(batteryLevel.toFixed(2) + "V");
        console.log(batteryLevel.toFixed(2) + "V");
        var batteryClass = "battery-";
        if (batteryLevel > 3) {
          batteryClass += "good";
        } else if (batteryLevel > 2.4) {
          batteryClass += "okay";
        } else {
          batteryClass += "bad";
        }
        $("#device-battery").removeClass("battery-good");
        $("#device-battery").removeClass("battery-okay");
        $("#device-battery").removeClass("battery-bad");
        $("#device-battery").addClass(batteryClass);

        //
        // time
        //
        var dtStr = date2str(new Date(parseInt(tokens[1], 10) * 1000));
        console.log(dtStr);
        $("#device-time").text(dtStr);

      });
  },

  refreshDeviceList: function() {

    rfduino.isEnabled(function() {

      // empty the device list
      $("#logger-list .device").remove();
      $("#logger-list .error").remove();

      // display the scanning indicator
      $("#refresh-list-button span.icon").addClass("scanning");
      $("#refresh-list-button").prop("disabled", true);

      // execute this code approximately the same time that scanning is complete
      setTimeout(function() {
        // hide the scanning indicator
        $("#refresh-list-button").prop("disabled", null);
        $("#refresh-list-button span.icon").removeClass("scanning");

        // display message when no devices found
        if ($(".table-view-cell", "#logger-list").length === 1) {
          $("#logger-list").append(
            "<li class='table-view-cell device'>No devices found</li>");
        }
      }, app.pollLength * 1000 + 5);

      rfduino.discover(app.pollLength, app.onDiscoverDevice, app.onError);
    }, function() {
      $("#logger-list").append(
        "<li class='table-view-cell error'>Bluetooth is not enabled</li>");
    });
  },

  // send a command to the rfduino and resolve a promise on response
  // using a timeout to wait for multi-packet responses, since the BLE
  // packet size is only 20 bytes
  sendCommand: function(command, arg, nowait) {

    var d = $.Deferred();

    var timeout = null;
    var str_buffer = "";

    // register the onData callback to receive any response from the rfduino after sending the command
    rfduino.onData(function(data) {

      // convert the response payload to a string
      var str = ab2str(data);

      // add the new data to the existing data
      str_buffer += str;

      if (!!nowait) { // used for single-packet responses
        d.resolve(str_buffer);
      } else { // used to wait for the rest of multiple-packet responses
        // if there is a timeout value, it is no longer valid
        if (timeout !== null) {
          clearTimeout(timeout);
        }
        // if there are no more response packets, resovle the deferred
        timeout = setTimeout(function() {
          d.resolve(str_buffer);
        }, 10); // 10ms shoudl be enough, right?
      }
    }, d.reject);

    // convert the command and argument payload to an arraybuffer
    var data = str2ab(command + (arg || ""));

    // send the command to the rfduino
    rfduino.write(data, function() { }, app.onError);

    // return the promise for asyncrony
    return d.promise();
  },

  // send a file as an email attachment
  sendFile: function() {

    //
    var file = app._currentFile;

    // TODO maybe create a temporary CSV from that file to attach it as a more "user friendly" format

    cordova.plugins.email.open({
        attachments: [file.toURL()],
        subject: "Project BOOST Temperature Data",
        body:    "<p>Attached is the data from the " + file.name.split("-")[0] + " logger.</p><hr><p style='color: #aaa'><em>Sent from the Project BOOST mobile application</em></p>",
        isHtml:  true
    });
  },

  // upload a file to the web site
  uploadFile: function(token) {

    console.log("token: " + token);

    var file = app._currentFile;

    console.log("connection type: " + navigator.connection.type);

    if (navigator.connection.type !== Connection.CELL_4G && navigator.connection.type !== Connection.WIFI) {
      navigator.notification.alert("Could not upload file. Please try again when you have a WiFi or 4G connection.", function() { }, "Upload");
      return;
    }

    file.file(function(file) {
      // create a FileReader to read the file
      var reader = new FileReader();
      reader.onloadend = function() {

        console.log("read the file");

        // get reference the to file contents
        var content = this.result;

        // begin the JSON data string
        // this had to be implemented as string -> JSON because
        // the runtime flattens multi-dimensional arrays when built dynamically
        var observations = [];

        // iterate through the lines
        content.split("\n").forEach(function(line) {

          // line length validation (min length is 26)
          if (line.length < 26) { // line too short = IGNORE
            return;
          }

          // message structure validation
          var tokens = line.split(/[,*]/);
          if (tokens.length !== 5) {
            return; // bad line structure = IGNORE
          }

          // checksum validation
          var reported_chksum = parseInt(line.replace(/[$].*[*](..).*/, "$1"), 16);
          var chksum = checksum(line.replace(/[$](.*)[*].*/, "$1"));
          if (chksum !== reported_chksum) {
            return; // checksum validation failed = IGNORE
          }

          // append the data to the JSON string
          observations.push({
            time: date2str(new Date(parseInt(tokens[1], 10) * 1000)),
            batt: parseFloat(tokens[2]),
            temp: parseFloat(tokens[3])
          });
        });

        console.log(JSON.stringify(observations[0]));

        var sorter = arraySorter(function(obj) {
          return obj.time;
        });
        observations.sort(sorter);

        console.log("# of obs to post: " + observations.length);

        console.log("getting ready to post");

        /*
        $.ajax({
          type: 'POST',
          url: url,
          data: data,
          success: success,
          dataType: dataType,
          async:false
        });
        */

        var obs_len = observations.length;
        var perform = function() {
          var obs = observations.splice(0, 15);

          $.ajax({
            type: "POST",
            url: app.apiUrl + "observations?token=" + token,
            data: {
              loggerId: file.name.split("-")[0],
              observations: obs
            },
            dataType: "json",
            async: false,
            success: function(response) {

            }
          }).fail(function(response) {
            console.log("error");
          });

          var percent = Math.floor(((obs_len - observations.length) * 100) / obs_len);
          //console.log(percent);

          $("#uploadprogress").text(percent + "%");

          if (observations.length > 0) {
            setTimeout(perform, 25);
          } else {
            $("a.disable-on-upload").removeClass("hidden");
            $(".show-on-upload").removeClass("visible");
            $("button.disable-on-upload").prop("disabled", false);
          }
        };

        $(".show-on-upload").addClass("visible");
        $("button.disable-on-upload").prop("disabled", true);
        $("a.disable-on-upload").addClass("hidden");
        $("#uploadprogress").text("0%");

        setTimeout(perform, 25);
      };

      console.log("getting ready to read the file");
      // perform the read to invoke the callback
      reader.readAsText(file);
    });
  },

  doLogin: function() {

    $("#btnLogin").prop("disabled", true);
    $("#btnRegistration").prop("disabled", true);

    var data = {
      username: $("form#loginform input[name='username']").val(),
      password: $("form#loginform input[name='password']").val()
    };

    $.post(app.apiUrl + "users/generateToken", data, function(response) {
      /*
      {
        "token": "6e4a017be1af917bf96376c506a10754",
        "expires": "2015-04-28 00:07:42",
        "name": "Jim Blaney"
      }

      {
        "error": {
          "code": 401,
          "message": "Unauthorized: Incorrect username/password or account is locked"
        },
        "debug": {
          "source": "Users.php:199 at call stage",
          "stages": {
            "success": [
              "get",
              "route",
              "negotiate",
              "validate"
            ],
            "failure": [
              "call",
              "message"
            ]
          }
        }
      }
      */
      $("#loginmodal").removeClass("active");

      localStorage.setItem("boost_user", data.username);
      localStorage.setItem("boost_pass", data.password);

      setTimeout(function() {
        app.uploadFile(response.token);
      }, 250);
    }, "json").fail(function(response) {
      navigator.notification.alert(response.responseJSON.error.message, function() {}, "Log In Failed")
    }).always(function() {
      $("#btnLogin").prop("disabled", false);
      $("#btnRegistration").prop("disabled", false);
    });
  },

  doRegistration: function() {

    $("#btnRegister").prop("disabled", true);

    var data = {
      name: $("form#registerform input[name='name']").val(),
      organization: $("form#registerform input[name='organization']").val(),
      phone: $("form#registerform input[name='phone']").val(),
      email: $("form#registerform input[name='email']").val(),
      password: $("form#registerform input[name='password']").val()
    };

    $.post(app.apiUrl + "users/register", data, function(response) {
      /*
      {
        "success": true
      }
      */

      $("#registermodal").removeClass("active");

      $("form#loginform input[name='username']").val(data.email);
      $("form#loginform input[name='password']").val(data.password);

      $("#loginmodal").addClass("active");
    }, "json").fail(function(response) {
      navigator.notification.alert(response.responseJSON.error.message, function() {}, "Log In Failed")
    }).always(function() {
      $("#btnRegister").prop("disabled", false);
    });
  }
};

app.initialize();
