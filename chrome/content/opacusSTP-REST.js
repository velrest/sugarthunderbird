/**********************************************************************
 * Portions written by Opacus (C) Mathew Bland, Jonathan Cutting,
 * Opacus Ltd.
 * 
 * This file is part of the Opacus SugarCRM Thunderbird Plugin.
 *
 * The Opacus SugarCRM Thunderbird Plugin
 * is free software:you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * The Opacus SugarCRM Thunderbird Plugin
 * is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the Opacus SugarCRM Thunderbird Plugin.
 * If not, see <http://www.gnu.org/licenses/>.
 *********************************************************************/
function opacusSTPrest(){	
	this.webservice_url = '';
	this.user_name = '';
	this.password = '';
	this.waitingForLogin = false;
};

opacusSTPrest.prototype.setCredentials = function(ws_url,ws_username,ws_password){
	this.webservice_url = ws_url + '/service/v2/rest.php';
	this.user_name = ws_username;
	this.password = ws_password;
};

opacusSTPrest.prototype.get_server_info = function(){
	var rest_data = {};
	this.callback=this.get_server_info_callback;
	this.makeRequest('get_server_info',rest_data,'');
};

opacusSTPrest.prototype.get_server_info_callback = function(response,extraData){
	opacusSTP.server_info = response;
};

opacusSTPrest.prototype.login = function(){
	this.waitingForLogin = true;		
	if(opacusSTP.session_id == ""){
		this.full_login();
	} else {
		var rest_data = opacusSTP.session_id;
		this.callback = this.login_callback;
		this.makeRequest('seamless_login',rest_data,'');
	}
};

opacusSTPrest.prototype.login_callback = function(response,extraData){
	if(!response.result == 1){
		this.full_login();
	} else {
		this.waitingForLogin = false;
	}
};

opacusSTPrest.prototype.full_login = function(){
	var rest_data = {
		user_auth : {
			user_name : this.user_name,
			password : this.password
		},
		application_name : 'Opacus STP',
		name_value_list : []
	};
	this.callback = this.full_login_callback;
	this.makeRequest('login',rest_data,'');
};

opacusSTPrest.prototype.full_login_callback = function(response,extraData){
	this.waitingForLogin = false;
	if(response.status == 'success'){
		opacusSTP.session_id = response.session_id;
		opacusSTP.user_id = response.user_id;
	} else {
		opacusSTP.notifyUser('critical',opacusSTP.strings.getString('notifyNoLogin'));
	}
};

opacusSTPrest.prototype.makeRequest = function(method,rest_data,extraData){

	var input_type;
	var client = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
                        .createInstance(Components.interfaces.nsIXMLHttpRequest);

	// Use serialize for files as json_decode in SugarCRM is really painful
	if(method == 'set_note_attachment'){
		input_type='Serialize';
	} else {
		input_type='JSON';
		rest_data = JSON.stringify(rest_data);
	}

	rest_data = rest_data.replace(new RegExp('(&|&amp;)quot;','g'),'\\"');
    rest_data = encodeURIComponent(rest_data);
	rest_data = rest_data.replace(new RegExp('\\+','g'),'%2B');
	rest_data = rest_data.replace(new RegExp('%20','g'),'+');

	var params = 'method=' + method + '&input_type='+input_type+'&response_type=JSON&rest_data=' + rest_data;

	client.open("POST", this.webservice_url, true);
	client.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
	client.setRequestHeader("Content-length", params.length);
	client.setRequestHeader("Connection", "close");

	client.webserviceReference = this;
	client.method = method;
	client.extraData = extraData;

	client.onreadystatechange = function(){
		if(client.readyState == 4) {
			if(client.status == 200){
				// If we meet a redirect to https, transparently change the server url
				if(client.channel.URI.spec.indexOf('https://') == 0 && opacusSTP.sugarurl.indexOf('https://') == -1){
					opacusSTP.sugarurl = opacusSTP.sugarurl.replace('http://','https://');
					client.webserviceReference.webservice_url = client.channel.URI.spec;
					client.webserviceReference.get_server_info();
				} else {
					try{
						var parsed = JSON.parse(client.responseText);
					}
					catch(ex){
						opacusSTP.console.logStringMessage("OpacusSTP unable to parse response: "+client.responseText)
						opacusSTP.notifyUser('critical',opacusSTP.strings.getString('notifyNoConnect'));
						return;
					}
					client.webserviceReference.callback(client.webserviceReference.parseResponse(parsed,client.method),client.extraData);
				}
			} else {
				opacusSTP.notifyUser('critical',opacusSTP.strings.getString('notifyNoConnect'));
				opacusSTP.console.logStringMessage("OpacusSTP bailing on client return status: "+client.status)
			}
		}
	}
	client.send(params);
};

opacusSTPrest.prototype.parseResponse = function(data,method){
	var return_object = new Object();
	switch(method){
		case "get_server_info":
		case "set_note_attachment" :
			var return_object = data;
			break;
		case "set_entry" :
			var return_object = data;
			break;
		case "set_relationship" :
			var return_object = data;
			break;
		case "get_entry_list" :
			if(typeof(data.entry_list[0]) !== 'undefined' && typeof(data.entry_list) !== 'undefined'){
				return_object.module = data.entry_list[0].module_name;
				return_object.items = new Array();
				if(return_object.module == 'Contacts' || return_object.module == 'Leads'){
					for(var i in data.entry_list){
						var first_name = (data.entry_list[i].name_value_list.first_name.value) ? data.entry_list[i].name_value_list.first_name.value + ' ' : '(...) ';
						return_object.items[i] = new Array(data.entry_list[i].id,
							first_name + data.entry_list[i].name_value_list.last_name.value);
					}
				} else if(return_object.module == 'Cases'){
					for(var i in data.entry_list){
						return_object.items[i] = new Array(data.entry_list[i].id,
							data.entry_list[i].name_value_list.case_number.value + ' ' + data.entry_list[i].name_value_list.name.value);
					}
				} else {
					for(var i in data.entry_list){
						return_object.items[i] = new Array(data.entry_list[i].id,data.entry_list[i].name_value_list.name.value);
					}
				}
			}
			break;
		case "login" :
			if(data.name != 'Invalid Login'){
				return_object.session_id = data.id;
				return_object.user_id = data.name_value_list.user_id.value;
				return_object.status = 'success';
			}
			break;
		case "seamless_login" :
			return_object.result = data;
			break;
		default	:
	}
	return return_object;
};

opacusSTPrest.prototype.get_entry_list = function(module,query,order_by,offset,select_fields,max_results,deleted,extraData){

	var rest_data = {
		"session"	: opacusSTP.session_id,
		"module"	: module,
		"query"		: query,
		"order_by"	: order_by,
		"offset"	: offset,
		"select_fields"	: select_fields,
		"link_name_to_fields_array" : new Array(),
		"max_results"	: max_results,
		"deleted"	: deleted,
	};
	this.makeRequest('get_entry_list',rest_data,extraData);
};

opacusSTPrest.prototype.archive = function(mailObject){

	var rest_data = {
		"session"	: opacusSTP.session_id,
		"module"	: 'Emails',
		"name_value_list" : {
			"assigned_user_id" : opacusSTP.user_id,
			"status" : "archived",
			"name"		: mailObject.subject,
			"description"		: mailObject.plain,
			"description_html"	: mailObject.html,
			"to_addrs"	: mailObject.recipients,
			"cc_addrs"	: mailObject.ccList,
			"bcc_addrs"	: mailObject.bccList,
			"from_addr" : mailObject.author,
			"from_addr_name" : mailObject.authorName,
			"date_sent" : mailObject.formatDate(mailObject.unixTime)
		}
	};
	this.makeRequest('set_entry',rest_data,mailObject);
};


opacusSTPrest.prototype.createRelationship = function(emailId,moduleLower,objectId,mailObject){	
	var rest_data = {
		"session"	: opacusSTP.session_id,
		"module_name"	: 'Emails',
		"module_id" : emailId,
		"link_field_name"		: moduleLower,
		"related_ids"		: [ objectId ],
		"name_value_list"	: new Array(),
		"deleted"	: 0
	};
	this.makeRequest('set_relationship',rest_data,mailObject);
};


opacusSTPrest.prototype.createNote = function(osa){

	var rest_data = {
		"session"	: opacusSTP.session_id,
		"module"	: 'Notes',
		"name_value_list" : {
			"name"		: osa.filename,
			"parent_type"		: 'Emails',
			"parent_id"	: osa.email_id,
		}
	};
	this.makeRequest('set_entry',rest_data,osa);
};


opacusSTPrest.prototype.setAttachment = function(note_id,osa){
	// setAttachment uses Serialize for speed.
	var rest_data = 'a:2:{s:7:"session";s:'+opacusSTP.session_id.length+':"'+opacusSTP.session_id+'";s:4:"note";'+
		'a:3:{s:8:"filename";s:'+this.utf8ByteCount(osa.filename)+':"'+osa.filename+'";'+
			's:4:"file";s:'+osa.contents.length+':"'+osa.contents+'";s:2:"id";s:'+note_id.length+':"'+note_id+'";}}';
	this.makeRequest('set_note_attachment',rest_data,osa);
};

/**
 * Functions to calculate length in bytes of string that may
 * contain UTF-8 chars as PHP unserialize function unable to
 * calculate actual length in chars.
 * 
 * This code is not included within the scope of the Opacus
 * licence. Our thanks to the original author.
 * 
 * See http://illegalargumentexception.blogspot.com/2010/12/javascript-validating-utf-8-string.html
 */

/**
 * codePoint - an integer containing a Unicode code point
 * return - the number of bytes required to store the code point in UTF-8
 */
opacusSTPrest.prototype.utf8Len = function(codePoint) {
  if(codePoint >= 0xD800 && codePoint <= 0xDFFF)
    throw new Error("Illegal argument: "+codePoint);
  if(codePoint < 0) throw new Error("Illegal argument: "+codePoint);
  if(codePoint <= 0x7F) return 1;
  if(codePoint <= 0x7FF) return 2;
  if(codePoint <= 0xFFFF) return 3;
  if(codePoint <= 0x1FFFFF) return 4;
  if(codePoint <= 0x3FFFFFF) return 5;
  if(codePoint <= 0x7FFFFFFF) return 6;
  throw new Error("Illegal argument: "+codePoint);
}

opacusSTPrest.prototype.isHighSurrogate = function(codeUnit) {
  return codeUnit >= 0xD800 && codeUnit <= 0xDBFF;
}

opacusSTPrest.prototype.isLowSurrogate = function(codeUnit) {
  return codeUnit >= 0xDC00 && codeUnit <= 0xDFFF;
}

/**
 * Transforms UTF-16 surrogate pairs to a code point.
 * See RFC2781
 */
opacusSTPrest.prototype.toCodepoint = function(highCodeUnit, lowCodeUnit) {
  if(!this.isHighSurrogate(highCodeUnit)) throw new Error("Illegal argument: "+highCodeUnit);
  if(!this.isLowSurrogate(lowCodeUnit)) throw new Error("Illegal argument: "+lowCodeUnit);
  highCodeUnit = (0x3FF & highCodeUnit) << 10;
  var u = highCodeUnit | (0x3FF & lowCodeUnit);
  return u + 0x10000;
}

/**
 * Counts the length in bytes of a string when encoded as UTF-8.
 * str - a string
 * return - the length as an integer
 */
opacusSTPrest.prototype.utf8ByteCount = function(str) {
  var count = 0;
  for(var i=0; i<str.length; i++) {
    var ch = str.charCodeAt(i);
    if(this.isHighSurrogate(ch)) {
      var high = ch;
      var low = str.charCodeAt(++i);
      count += this.utf8Len(this.toCodepoint(high, low));
    } else {
      count += this.utf8Len(ch);
    }
  }
  return count;
}


