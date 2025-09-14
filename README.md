# Introduction

`raw-device` is Node module to remotely control devices using LAN/TCP, LAN/UDP or RS-232/serial connections.
The device control protocal must be based on sending and receiving sequence of bytes/ASCII characters in request-response schema which is a common for communication protocols.  
A base object `RAW` is thought to be a prototype for other, more specific communication objects, but can also be used as stand-alone, full-functional object for simple scenarios.

## Main features
- different connection modes: tcp/udp/serial/stream
- different schemas of connect-disconnect cycle
- requests queuing and timing management
- events driven
- easy extensible

## Usage
```js
const RAW = require('raw-device');

//send-receive data for TCP socket device
const dev1 = new RAW({host: '192.168.4.31', port: 9761});
dev1.emitter.on('responseFromDevice', data => console.log(data));
dev1.process('some_command_str\n');

//send-receive data for UDP socket device
const dev1 = new RAW({host: '192.168.4.31', port: 9761, mode: 'udp'});
dev1.emitter.on('responseFromDevice', data => console.log(data));
dev1.process('some_command_str\n');

//send data for Serial device
const dev2 = new RAW({path: 'com2'});
dev2.process('00x00x00x00x14x60', '3Bx78x5D');
```

# RAW Object
The primary exported object is `RAW`, which you'll use directly to communicate with serial, tcp or udp devices or use as prototype for you own objects. This section covers direct use.
## Constructor `new RAW(AddressObject, OptionsObject)`
- `AddressObject <Object>` - required. Use only properties associated with the desired mode (serial, tcp, udp, stream)
    - `name <string>` - default: 'RAWdevice'
    - `mode <string>` - default: auto-detects between tcp and serial based on other arguments  
    //for serial
    - `path <string>` - required. Use valid serial path available in system.
    - `baudRate <number>` - default 9600
    - `dataBits <number>` - default 8
    - `parity <string>` - default 'none'
    - `stopBits <number>` - default 1  
    //for tcp or udp
    - `host <string>` - required. Use valid IP address
    - `port <number>` - default 23   
    //for stream
    - `stream <Stream>` - required. The stream must be opened read/write Node.js stream. This mode is used when multiple devices are chained with RS232 cables and connected to single system serial port. RAW object does not cares about the stream. You have to maintain stream yourself (open, close, error handling).

- `OptionsObject <Object>` - optional, default is `{encoding: 'ASCII', duration: 1500, disconnect: true, splitter: {timeout: 1100}}`
    - `encoding <string>` - default 'ASCII'
    - `duration <number>` - default 1500 ms. Inter-command period [ms]. A time for device to process command and to prepare and send a response.
    - `disconnect <boolean|number>` - default true. Connecion cycle scheme. Use true, false or timeout[ms]. True means close connection when command queue is empty, false means do not close connection, number means close connection after time of connection inactivity.
    - `splitter <Object>` - Used to select one among three supported transform streams which merge incoming data chunks and split it into valid responses. Only single property from delimiter, regex, timeout can be used. Default is `{timeout: 1100}`
        - `delimiter <string>` - use `@serialport/parser-delimiter` with string delimiter
        - `includeDelimiter <boolean>` - if string delimiter is used includeDelimiter decides if delimiter string itself is included in result string
        - `regex <Regex>` - use `@serialport/parser-regex` with regex
        - `timeout <number>` - use `@serialport/parser-inter-byte-timeout` with timeout. Response is completed if inter-byte time is longer then timeout. Please consider that timeout must be shorter than duration (inter-command period) and disconnect time (if disconnect use timeout scheme).
    - `logger <Object>` - used to log data sent to and/or coming from device. Logs are written in program directory. File names are generated automaticly.
        - `devlog <boolean>` - log data coming from device.
        - `talklog <boolean>` - log data sent to and coming from device in single file.
    - `dictionary <Map>` - default is empty. Sometimes it is more convenient to use friendly commands rather then unnatural sequence of Hex/ASCII. The dictionary is just for that. It must contain friendly commands as keys and corresponding Hex/ASCII sequence as values

## Method `process(...commands)`
Commands can be regular strings or hexadecimal encoded strings. Hexadecimal strings can use x, :(colon) or -(minus) as separator. Usually devices expect commands to be terminated with some special character. Most common is CR(carriage return, 0x0D, \r). Please remember to append termination character manually at the end of command string. Example: `process('some_command\r')`.

## Internal commands
There are some internal commands which starts with `#`. They are not sent to device, but are processed by RAW itself.  
- `#pause number` - Append additional pause between neighboring commands as number of miliseconds.
- `#connect` -  Force to open connection to device.
- `#close` - Force to close connection to device.

## Event: `responseFromDevice`
Emited when device response is properly decoded.
- `response <Object>`
    - `name <string` - device name
    - `dev <string>` - obsolete, same as name
    - `raw <Buffer>` - not decoded raw response
    - `value <string>` - response decoded to string value

## Event: `commandForDevice`
Emited when command is properly encoded and sent to device. Of course only `encoded` property is sent to device itself.
- `command <Object>`
    - `name <string>` - device name
    - `command <string>` - a command itself, not parsed or encoded
    - `encodedstr <string>` - command encoded as string
    - `encoded <Buffer>` - command encoded as Buffer
    - `duration <number>` - time [ms] for device to process the command (and generate a possible response).

## Event: `connectionData`
A data which comes directly from device port "as is". Not decoded, merged or chopped by splitter. Event is not emited in stream mode.
- `dataObj <Object>`
    - `name <string>` - device name
    - `address <string>` - device address as string
    - `data <Buffer>` - data itself

## Event: `connectionStatus`
Emited when device connection status changes. Event is not emited in stream mode.
- `statusObj <Object>`
    - `name <string>` - device name
    - `dev <string>` - obsolete, same as name
    - `address <string>` - device address as string
    - `status <string>` - connection status
    - `more <string|Object>` - additional status information
