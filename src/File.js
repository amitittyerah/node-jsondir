/**
 * @fileOverview Contains the File class.
 *
 * @author Daniel Imhoff
 */

'use strict';

var PATH = require('path');
var FS = require('fs');
var uidNumber = require('uid-number');

var Exception = function(message) {
  this.message = message;
  this.name = 'Exception';
};

Exception.prototype = Object.create(Error.prototype);

/**
 * A File represents any regular, directory, or symlink file.
 *
 * @param {object} options
 */
var File = function(options) {
  options = options || {};
  this.path = PATH.normalize(options.path);
  this.exists = FS.existsSync(this.path);
  this.umask = 'umask' in options ? options.umask : File.UMASK;

  if (this.exists) {
    this.stats = this.getStats();
    this.type = this.getType();
    this.mode = this.stats.mode & 511; // 511 == 0777
    this.uid = this.stats.uid;
    this.gid = this.stats.gid;
  }
  else {
    this.owner = options.owner;
    this.group = options.group;

    if ('type' in options) {
      if (options.type in File.Types) {
        this.type = File.Types[options.type];
      }
      else {
        throw new File.UnknownFileTypeException('Unknown file type: ' + options.type + '.');
      }
    }
    else {
      throw new File.MissingRequiredParameterException('"type" is required for nonexistent files.');
    }

    switch (this.type) {
    case File.Types.file:
      this.content = 'content' in options ? options.content : '';

      break;
    case File.Types.symlink:
      if ('dest' in options) {
        this.dest = options.dest;
      }
      else {
        throw new File.MissingRequiredParameterException('"dest" is a required option for symlink files.');
      }

      break;
    }

    this.mode = File.interpretMode(options.mode, options.type, this.umask);
  }
};

File.UnknownFileTypeException = function(message) {
  Exception.call(this, message || 'Unknown file type.');
};

File.UnknownFileTypeException.prototype = Object.create(Exception.prototype);

File.FileExistsException = function(message) {
  Exception.call(this, message || 'File already exists.');
};

File.FileExistsException.prototype = Object.create(Exception.prototype);

File.FileMissingException = function(message) {
  Exception.call(this, message || 'File does not exist.');
};

File.FileMissingException.prototype = Object.create(Exception.prototype);

File.MissingRequiredParameterException = function(message) {
  Exception.call(this, message || 'Missing required parameter.');
};

File.MissingRequiredParameterException.prototype = Object.create(Exception.prototype);

File.IncorrectFileTypeException = function(message) {
  Exception.call(this, message || 'Incorrect file type.');
};

File.IncorrectFileTypeException.prototype = Object.create(Exception.prototype);

File.UMASK = 18; // 18 == 0022
File.DIRECTORY_SEPARATOR = PATH.normalize('/');

File.Types = Object.freeze({
  'file': 0,
  'f': 0,
  '-': 0,
  'directory': 1,
  'dir': 1,
  'd': 1,
  'symbolic link': 2,
  'symlink': 2,
  'l': 2
});

/**
 * Given an interpretable string or number, this function will return the
 * decimal format representing the permission mode on Unix systems. If mode is
 * omitted, type is required. In that case, it returns the default permission
 * mode for that file type with a given umask (or 022 if not specified).
 *
 * @param  {mixed} mode Examples: 'rw-r--r--', 'rwxr-xr-x', 0644, 0755
 * @param  {string} type Valid strings found in File.Types.
 * @param  {number} umask
 * @return {number} Decimal representation of permission mode.
 */
File.interpretMode = function(mode, type, umask) {
  switch (typeof mode) {
  case 'undefined':
    if (typeof type !== 'undefined' && type in File.Types) {
      type = File.Types[type];

      if (typeof umask === 'undefined') {
        umask = File.UMASK;
      }

      if (type === File.Types.symlink) {
        return 511; // 511 == 0777
      }

      return (type === File.Types.directory ? 511 : 438) - umask; // 511 == 0777, 438 == 0666
    }

    break;
  case 'string':
    switch (mode.length) {
    case 10:
      mode = mode.substring(1);
      /* falls through */
    case 9:
      var modeParts = [
        mode.substring(0, 3),
        mode.substring(3, 6),
        mode.substring(6, 9)
      ];

      var decMode = 0;

      for (var power = 0; power <= 2; ++power) {
        var modePartsChars = modeParts[2 - power].split(''),
            decModeAddition = 0;

        if (modePartsChars[0] === 'r') {
          decModeAddition += 4;
        }

        if (modePartsChars[1] === 'w') {
          decModeAddition += 2;
        }

        if (modePartsChars[2] === 'x') {
          decModeAddition += 1;
        }

        decMode += decModeAddition * Math.pow(8, power);
      }

      return decMode;
    case 3:
      var octal = parseInt(mode, 8);

      if (!isNaN(octal) && octal >= 0 && octal <= 511) {
        return octal;
      }

      break;
    }

    break;
  case 'number':
    if (mode >= 0 && mode <= 511) { // 511 == 0777
      return mode; // Seems good to me.
    }

    break;
  }

  return false;
};

/**
 * Returns the FS.Stats object associated with this File.
 *
 * @return {FS.Stats}
 */
File.prototype.getStats = function() {
  if (typeof this.stats === 'undefined') {
    if (!this.exists) {
      throw new File.FileMissingException('Cannot get stats of nonexistent file.');
    }

    this.stats = FS.lstatSync(this.path);
  }

  return this.stats;
};

/**
 * Returns the file type of this File the File.Types enumeration.
 *
 * @return {number}
 */
File.prototype.getType = function() {
  if (typeof this.type === 'undefined') {
    if (typeof this.stats === 'undefined') {
      this.stats = this.getStats();
    }

    if (this.stats.isFile()) {
      this.type = File.Types.file;
    }
    else if (this.stats.isDirectory()) {
      this.type = File.Types.directory;
    }
    else if (this.stats.isSymbolicLink()) {
      this.type = File.Types.symlink;
    }
  }

  return this.type;
};

/**
 * Returns the file path.
 *
 * @return {string}
 */
File.prototype.getPath = function() {
  return this.path;
};

/**
 * Returns the contents of the file.
 *
 * @return {string}
 */
File.prototype.getContent = function() {
  if (this.type !== File.Types.file) {
    throw new File.IncorrectFileTypeException('Cannot get content of nonnormal file.');
  }

  if (typeof this.content === 'undefined') {
    this.content = FS.readFileSync(this.path, { encoding: 'utf8' });
  }

  return this.content;
};

/**
 * Returns the destination of the file.
 *
 * @return {string}
 */
File.prototype.getDest = function() {
  if (this.type !== File.Types.symlink) {
    throw new File.IncorrectFileTypeException('Cannot get destination of nonsymlink file.');
  }

  if (typeof this.dest === 'undefined') {
    this.dest = FS.readlinkSync(this.path);
  }

  return this.dest;
};

/**
 * Creates this File on the filesystem using given information.
 *
 * @param  {Function} callback
 */
File.prototype.create = function(callback) {
  if (this.exists) {
    return callback(new File.FileExistsException("File already exists."));
  }

  var self = this;

  switch (this.type) {
  case File.Types.file:
    FS.writeFile(this.path, this.content, function(err) {
      if (err) callback(err);
      self.chmod(function(err) {
        if (err) callback(err);
        self.chown(function(err) {
          if (err) callback(err);
          callback();
        });
      });
    });
    break;
  case File.Types.directory:
    FS.mkdir(this.path, function(err) {
      if (err) callback(err);
      self.chmod(function(err) {
        if (err) callback(err);
        self.chown(function(err) {
          if (err) callback(err);
          callback();
        });
      });
    });
    break;
  case File.Types.symlink:
    FS.symlink(this.dest, this.path, function(err) {
      if (err) callback(err);
      callback();
    });
    break;
  }
};

/**
 * Changes the permissions mode of this file to stored data.
 *
 * @param  {Function} callback
 */
File.prototype.chmod = function(callback) {
  FS.chmod(this.path, this.mode, function(err) {
    if (err) callback(err);
    callback();
  });
};

/**
 * Changes the owner and group of this file to stored data using the uidNumber
 * package.
 *
 * @param  {Function} callback
 */
File.prototype.chown = function(callback) {
  var self = this;

  if ('owner' in self || 'group' in self) {
    uidNumber(this.owner, this.group, function(err, uid, gid) {
      if (err) callback(err);
      FS.chown(self.path, uid, gid, function(err) {
        if (err) callback(err);
        callback();
      });
    });
  }
  else {
    callback();
  }
};

module.exports.File = File;
