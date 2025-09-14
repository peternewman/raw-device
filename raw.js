const events = require('events');
const fs = require('fs');

RAW.prototype.addressDefaults = {
	name: 'RAWdevice',
    mode: 'tcp',
    //for serial
    baudRate: 9600,
    dataBits:8,
    parity: 'none',
    stopBits: 1,
    //for TCP or UDP
    port: 23
}

RAW.prototype.optionsDefaults = {
    encoding: 'ASCII',
	duration: 1500,
    disconnect: true,
	splitter: {
		//delimiter: '\r\n',
		//regex: /[\r\n]+/,
        timeout: 1100
	},
    logger: {
        devlog: false,
        talklog: false
    },
    dictionary: new Map()
}

/**
 * @constructor
 * @param {AddressObject} address
 * @param {OptionsObject} [options]
 * @fires RAW#connectionData
 * @fires RAW#connectionStatus
 */
function RAW(address, options={}){
    this.address = Object.assign({}, this.addressDefaults, address)
    this.addressStr;
    this.mode = this.address.mode;//host and path can't exist together!
    this.name = this.address.name;
    if(this.address.host && this.address.mode == 'udp')
        this.mode = 'udp';
    else if(this.address.host)
        this.mode = 'tcp';
    else if(this.address.path)
        this.mode = 'serial';
    else if(this.address.stream)
        this.mode = 'stream';

    this.options = Object.assign({}, this.optionsDefaults, options);
    this.duration = this.options.duration;
    /** a stream for logging data incoming from device */
    this.devStream; 
    /** a stream for logging both: data for device and data from device */
    this.talkStream;
    /** setup logger streams */
    if('logger' in this.options){
        if(this.options.logger.devlog)
            this.devStream = fs.createWriteStream(`./dev_${this.name}_${Date.now()}.log`);
        if(this.options.logger.talklog)
            this.talkStream = fs.createWriteStream(`./talk_${this.name}_${Date.now()}.log`);
    }
    this.emitter = new events.EventEmitter();
    this.queue = [];
    this.splitter; //a transform stream to split incoming data into messages
    if('delimiter' in this.options.splitter){
        const { DelimiterParser } = require('@serialport/parser-delimiter');
        let include = false;
        if('includeDelimiter' in this.options.splitter)
            include = this.options.splitter.includeDelimiter;
        this.splitter = new  DelimiterParser({ delimiter: this.options.splitter.delimiter, includeDelimiter: include});
    }
    else if('regex' in this.options.splitter){
        const { RegexParser } = require('@serialport/parser-regex');
        this.splitter = new RegexParser({ regex: this.options.splitter.regex});
    }
    else if('timeout' in this.options.splitter){
        const { InterByteTimeoutParser } = require('@serialport/parser-inter-byte-timeout');
        this.splitter = new InterByteTimeoutParser({interval: this.options.splitter.timeout});
    }
    this.splitter.on('data', (data) => this.decode(data));

    switch(this.mode){
        case 'tcp':
            this.addressStr = `${this.address.host}:${this.address.port}`;
            const net = require('net');
            this.socket = new net.Socket();
            if(this.options.encoding)
                this.socket.setEncoding(this.options.encoding);
            this.socket.pipe(this.splitter);
            if(this.devStream)
                this.socket.pipe(this.devStream);
            if(this.talkStream)
                this.socket.pipe(this.talkStream);
            this.socket.on('data', data => {
                this.emitter.emit('connectionData', {dev/* obsolete */: this.name, name: this.name, address: this.addressStr, data: data})
            });
            this.socket.on('connect', () => {
                this.emitter.emit('connectionStatus', {dev/* obsolete */: this.name, name: this.name, address: this.addressStr, status: 'connected'})
            });
            this.socket.on('error', (error) => {
                this.emitter.emit('connectionStatus', {dev/* obsolete */: this.name, name: this.name, address: this.addressStr, status: 'error', more: error})
            });
            this.socket.on('close', () => {
                this.emitter.emit('connectionStatus', {dev/* obsolete */: this.name, name: this.name, address: this.addressStr, status: 'closed'})
            });
            if(parseInt(this.options.disconnect))
                this.socket.setTimeout(this.options.disconnect, () => this.close());
            break;
        case 'udp':
            this.addressStr = `${this.address.host}:${this.address.port}`;
            const dgram = require('node:dgram');
            this.socket = dgram.createSocket('udp4');
//            if(this.options.encoding)
//                this.socket.setEncoding(this.options.encoding);
//            this.socket.pipe(this.splitter);
//            if(this.devStream)
//                this.socket.pipe(this.devStream);
//            if(this.talkStream)
//                this.socket.pipe(this.talkStream);
//            this.socket.on('data', data => {
//                this.emitter.emit('connectionData', {dev/* obsolete */: this.name, name: this.name, address: this.addressStr, data: data})
//            });
//            this.socket.on('connect', () => {
//                this.emitter.emit('connectionStatus', {dev/* obsolete */: this.name, name: this.name, address: this.addressStr, status: 'connected'})
//            });
//            this.socket.on('error', (error) => {
//                this.emitter.emit('connectionStatus', {dev/* obsolete */: this.name, name: this.name, address: this.addressStr, status: 'error', more: error})
//            });
//            this.socket.on('close', () => {
//                this.emitter.emit('connectionStatus', {dev/* obsolete */: this.name, name: this.name, address: this.addressStr, status: 'closed'})
//            });
//            if(parseInt(this.options.disconnect))
//                this.socket.setTimeout(this.options.disconnect, () => this.close());
            break;
        case 'serial':
            this.addressStr = `${this.address.path}:${this.address.baudRate},${this.address.dataBits},${this.address.parity},${this.address.stopBits}`;
            const { SerialPort } = require('serialport');
            this.address.autoOpen = false; //może ładniej
            this.port = new SerialPort(this.address); 
            if(this.options.encoding)
                this.port.setEncoding(this.options.encoding);
            this.port.pipe(this.splitter);
            if(this.devStream)
                this.port.pipe(this.devStream);
            if(this.talkStream)
                this.port.pipe(this.talkStream);
            this.port.on('data', data => {
                this.emitter.emit('connectionData', {dev/* obsolete */: this.name, name: this.name, address: this.addressStr, data: data})
            });
            this.port.on('open', () => {
                this.emitter.emit('connectionStatus', {dev/* obsolete */: this.name, name: this.name, address: this.addressStr, status: 'opened'})
            });
            this.port.on('error', err => {
                this.emitter.emit('connectionStatus', {dev/* obsolete */: this.name, name: this.name, address: this.addressStr, status: 'error', more: err.message})
            });
            this.port.on('close', () => {
                this.emitter.emit('connectionStatus', {dev/* obsolete */: this.name, name: this.name, address: this.addressStr, status: 'closed'})
            })
            break;
        case 'stream':
            this.addressStr = 'stream';
            if(this.options.encoding)
                this.address.stream.setEncoding(this.options.encoding);
            this.address.stream.pipe(this.splitter);
            break;
        default:
            break;
    } 
 }

 /**
  * open connection to device port
  */
 RAW.prototype.connect = function(){
    if(this.mode == 'tcp'){
        if(this.socket.readyState === 'closed' || this.socket.pending)
            this.socket.connect(this.address);
            //chyba tu też trzeba settimeout
    }
    else if(this.mode == 'udp'){
//        if(this.socket.readyState === 'closed' || this.socket.pending)
//            this.socket.connect(this.address.port, this.address.host);
            //TODO: Is it necessary to settimeout here too?
    }
    else if(this.mode == 'serial'){
        if(!this.port.isOpen)
            this.port.open();
    }
 }

 /**
  * close connection to device port
  */
 RAW.prototype.close = function(){
    if(this.mode == 'tcp'){
        if(this.socket.readyState === 'open')
            this.socket.destroy();
    }
    else if(this.mode == 'udp'){
//        if(this.socket.readyState === 'open')
            this.socket.close();
    }
    else if(this.mode == 'serial')
        if(this.port.isOpen)
            this.port.close();
 }

 /**
  * process input commands
  * @param {...string} commands - commands can be regular strings or hexadecimal encoded strings.
  * Hexadecimal strings can use x, :(colon) or -(minus) as separator
  */
RAW.prototype.process = function(...commands){    
    if(this.queue.length > 0)
        this.queue = this.queue.concat(commands);
    else{
        this.queue = this.queue.concat(commands);
        this.dequeue()
    }
}

/**
 * Process single command from device queue
 * @fires RAW#commandForDevice
 * commandForDevice event is not necessery for RAW to work. Useful for testing/debuging
 */
RAW.prototype.dequeue = function(){
    if(this.queue.length > 0){
        let str = this.queue[0];
        let cmdo = this.encode(str);
        if(!cmdo)
            cmdo = {};
        if(!cmdo.encoded)
            cmdo.encoded = Buffer.from('');
        if(!cmdo.duration)
            cmdo.duration = 0;
        if(cmdo.encoded.length > 0){
            this.connect();
            switch(this.mode){
                case 'tcp':
                    this.socket.write(cmdo.encoded, () => {
                        this.emitter.emit('commandForDevice', cmdo);
                        if(this.talkStream)
                            this.talkStream.write(cmdo.encoded);
                    });
                    break;
                case 'udp':
                    this.socket.send(cmdo.encoded, this.address.port, this.address.host, () => {
                        this.emitter.emit('commandForDevice', cmdo);
                        if(this.talkStream)
                            this.talkStream.write(cmdo.encoded);
                    });
                    break;
                case 'serial':
                    this.port.write(cmdo.encoded, (error) => {
                        this.emitter.emit('commandForDevice', cmdo);
                        if(this.talkStream)
                            this.talkStream.write(cmdo.encoded);
                    });
                    break;
                case 'stream':
                    this.address.stream.write(cmdo.encoded, () => {
                        this.emitter.emit('commandForDevice', cmdo);
                    });
                    break;
                default:
                    break;
            }
        }
        setTimeout((() =>{
            this.queue.shift();
            this.dequeue();
        }).bind(this), cmdo.duration);
    }
    else if(this.options.disconnect === true)
        this.close();
}

/**
 * Encode command for device according to its language/protocol
 * @param {string} cmd  - a command to encode
 * @returns {CommandObject} cmdObj
 */
RAW.prototype.encode = function(cmd){
    if(cmd.startsWith('#'))
        return this.special(cmd);
    let encoding = this.options.encoding;
    let encodedstr = cmd;
    let cmdObj = {
        name: this.name,
        dev: this.name, //same as name, obsolete
        command: cmd,
        encodedstr: '', 
        encoded: null,
        duration: this.duration
    }

    if(this.options.dictionary.size > 0)
        if(this.options.dictionary.has(cmd))
            encodedstr = this.options.dictionary.get(cmd);

    if(isHexStr(encodedstr)){
        encoding = 'HEX';
        encodedstr = encodedstr.trim().replace(/[x:-]/g, '');
    }
    cmdObj['encodedstr'] = encodedstr;
    cmdObj['encoded'] = Buffer.from(encodedstr, encoding);
    return cmdObj;
}

/**
 * Process special commands starting with #
 * @param {string} cmd 
 * @returns {CommandObject|null} cmdObj
 */
RAW.prototype.special = function(cmd){
    let res = /#(\w+)( (\w+)(,(\w+)?)?)?/.exec(cmd);
	if(!res)
		return null;
    if(res[1].toLowerCase() == 'pause'){
        let cmdObj = {
            dev: this.address.name,
            command: cmd,
            duration: parseInt(res[3])
        }
        return cmdObj;
    }
    else if(res[1].toLowerCase() == 'connect')
        this.connect();
    else if(res[1].toLowerCase() == 'close')
        this.close();
    else
        return null;
}

/**
 * Decode response from device to usefull form
 * @param {Buffer} data - a data from this.splitter
 * @fires RAW#responseFromDevice
 */
RAW.prototype.decode = function(data){
    var decoded;
    if(this.options.encoding) //! changed in 1.1.0
        decoded = data.toString(this.options.encoding);
    var decodedObj = {
        name: this.name,
        dev: this.name, // obsolete, same as name
        raw: data,
        value: decoded,
    }
    this.emitter.emit('responseFromDevice', decodedObj); 
    return;
}

function isHexStr(str){
    let s = str.trim().replace(/[x:-]/g, '');
    if(/^[0-9a-fA-F]+$/.test(s))
        return true;
    else
        return false;
}

 module.exports = RAW;
