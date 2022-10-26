'use strict';

import React from 'react'
import PropTypes from 'prop-types'
import ReactNative, {
  requireNativeComponent,
  NativeModules,
  UIManager,
  PanResponder,
  PixelRatio,
  Platform,
  ViewPropTypes,
  processColor,
  ScrollView,
  Image,
} from 'react-native'
import { requestPermissions } from './handlePermissions';
import ImageZoom from 'react-native-image-pan-zoom';
import { Dimensions } from 'react-native';
import prettyFormat from 'pretty-format';

const RNSketchCanvas = requireNativeComponent('RNSketchCanvas', SketchCanvas, {
  nativeOnly: {
    nativeID: true,
    onChange: true
  }
});
const SketchCanvasManager = NativeModules.RNSketchCanvasManager || {};
var self;
var zoomx = 0; 
var zoomy = 0;
var zooming = 0;

class SketchCanvas extends React.Component {
  static propTypes = {
    style: ViewPropTypes.style,
    strokeColor: PropTypes.string,
    strokeWidth: PropTypes.number,
    onPathsChange: PropTypes.func,
    onStrokeStart: PropTypes.func,
    onStrokeChanged: PropTypes.func,
    onStrokeEnd: PropTypes.func,
    onSketchSaved: PropTypes.func,
    user: PropTypes.string,

    touchEnabled: PropTypes.bool,

    text: PropTypes.arrayOf(PropTypes.shape({
      text: PropTypes.string,
      font: PropTypes.string,
      fontSize: PropTypes.number,
      fontColor: PropTypes.string,
      overlay: PropTypes.oneOf(['TextOnSketch', 'SketchOnText']),
      anchor: PropTypes.shape({ x: PropTypes.number, y: PropTypes.number }),
      position: PropTypes.shape({ x: PropTypes.number, y: PropTypes.number }),
      coordinate: PropTypes.oneOf(['Absolute', 'Ratio']),
      alignment: PropTypes.oneOf(['Left', 'Center', 'Right']),
      lineHeightMultiple: PropTypes.number,
    })),
    localSourceImage: PropTypes.shape({ filename: PropTypes.string, directory: PropTypes.string, mode: PropTypes.oneOf(['AspectFill', 'AspectFit', 'ScaleToFill']) }),
    permissionDialogTitle: PropTypes.string,
    permissionDialogMessage: PropTypes.string,
  };

  static defaultProps = {
    style: null,
    strokeColor: '#000000',
    strokeWidth: 3,
    onPathsChange: () => { },
    onStrokeStart: () => { },
    onStrokeChanged: () => { },
    onStrokeEnd: () => { },
    onSketchSaved: () => { },
    user: null,

    touchEnabled: true,

    text: null,
    localSourceImage: null,
    imageDimensions: null,
    permissionDialogTitle: '',
    permissionDialogMessage: '',
  };

  state = {
    text: null
  }

  constructor(props) {
    super(props)
    this._pathsToProcess = []
    this._paths = []
    this._path = null;
    this._handle = null
    this._screenScale = Platform.OS === 'ios' ? 1 : PixelRatio.get()
    this._offset = { x: 0, y: 0 }
    this._size = { width: 0, height: 0 }
    this._initialized = false
    this.state.zoomx = 0;
    this.state.zoomy = 0;
    this.state.width = Dimensions.get('window').width;
    this.state.height = Dimensions.get('window').height;
    this.state.orientationChanged = false;
    this.state.portraitOffset = {x: 0, y: 0};
    this.state.landscapeOffset = {x: 0, y: 0};
    this.state.portraitDimensions = {};
    this.state.portraitWidth = 0;
    this.state.portraitHeight = 0;
    this.state.landscapeWidth = 0;
    this.state.landscapeHeight = 0;
    this.state.landscapeDimensions = {};
    this.state.offsetX = 0;
    this.state.startZoom = false;
    this.state.path = {};
    this.state.paths = [];
    self = this;
    this.state.text = this._processText(props.text ? props.text.map(t => Object.assign({}, t)) : null)
    this.state.shouldDelete = [];
    this.state.activeTouches = 1;
    this.touchStartTime = 0;
    this.isDrawing = false;
    this.handleLayoutChange = this.handleLayoutChange.bind(this);
  }

  orientationChange(e) {
    console.log('clear path temporarily because of orientation')
    if (self.state.zoomx == 0 && self.state.zoomy == 0) {
      self.setState({ width: e.window.width, height: e.window.height })
    } else {
      if (self.state.orientationChanged == false) {
        self.setState({ width: self.state.height, height: self.state.width, orientationChanged: true })
      }
    }
    UIManager.dispatchViewManagerCommand(self._handle, UIManager.RNSketchCanvas.Commands.clear, [])
  }

  componentWillUnmount() {
    Dimensions.removeEventListener('change', this.orientationChange);
  }

  componentWillReceiveProps(nextProps) {
    this.setState({
      text: this._processText(nextProps.text ? nextProps.text.map(t => Object.assign({}, t)) : null)
    })
  }

  _processText(text) {
    text && text.forEach(t => t.fontColor = processColor(t.fontColor))
    return text
  }

  clear() {
    this._paths = []
    this._path = null
    UIManager.dispatchViewManagerCommand(this._handle, UIManager.RNSketchCanvas.Commands.clear, [])
  }

  undo() {
    let lastId = -1;
    this._paths.forEach(d => lastId = d.drawer === this.props.user ? d.path.id : lastId)
    if (lastId >= 0) this.deletePath(lastId)
    return lastId
  }

  addPath(data) {
    if (this._initialized) {
      if (this._paths.filter(p => p.path.id === data.path.id).length === 0) this._paths.push(data)
      const pathData = data.path.data.map(p => {
        const coor = p.split(',').map(pp => parseFloat(pp).toFixed(2))
        return `${coor[0] * this._screenScale * this._size.width / data.size.width},${coor[1] * this._screenScale * this._size.height / data.size.height}`;
      })
      UIManager.dispatchViewManagerCommand(this._handle, UIManager.RNSketchCanvas.Commands.addPath, [
        data.path.id, processColor(data.path.color), data.path.width * this._screenScale, pathData
      ])
    } else {
      this._pathsToProcess.filter(p => p.path.id === data.path.id).length === 0 && this._pathsToProcess.push(data)
    }
  }

  deletePath(id) {
    this._paths = this._paths.filter(p => p.path.id !== id)
    UIManager.dispatchViewManagerCommand(this._handle, UIManager.RNSketchCanvas.Commands.deletePath, [id])
  }

  save(imageType, transparent, folder, filename, includeImage, includeText, cropToImageSize) {
    UIManager.dispatchViewManagerCommand(this._handle, UIManager.RNSketchCanvas.Commands.save, [imageType, folder, filename, transparent, includeImage, includeText, cropToImageSize])
  }

  getPaths() {
    return this._paths
  }

  getBase64(imageType, transparent, includeImage, includeText, cropToImageSize, callback) {
    if (Platform.OS === 'ios') {
      SketchCanvasManager.transferToBase64(this._handle, imageType, transparent, includeImage, includeText, cropToImageSize, callback)
    } else {
      NativeModules.SketchCanvasModule.transferToBase64(this._handle, imageType, transparent, includeImage, includeText, cropToImageSize, callback)
    }
  }

  validateDrawingState(evt, gestureState) {
  	if(this.state.zoomx === 0) {
  		if(!this.isDrawing){
        if (gestureState.numberActiveTouches == 1) {
          this.startDrawing(evt, gestureState);
        }
		  }
		  return true;
	  }
    if(this.isDrawing) {
      return true;
    }
    if(this.touchStartTime < new Date().getTime()){
      if (this.state.zoomx && this.state.zoomy) {
        if (this.state.zoomx != zoomx) {
          zoomx = this.state.zoomx;
          zoomy = this.state.zoomy
          return false;
        } else {
          this.startDrawing(evt, gestureState);
          return true;
        }
      }
    }
    zoomx = this.state.zoomx;
    zoomy = this.state.zoomy
    return false;
  }

  startDrawing(evt, gestureState){
    this.isDrawing = true;
    const e = evt.nativeEvent
    this._offset = { x: e.pageX - e.locationX, y: e.pageY - e.locationY }
    if (this.state.defaultDimensions.width > this.state.defaultDimensions.height) {
      this.setState({ landscapeOffset: this._offset })
    } else {
      this.setState({ portraitOffset: this._offset })
    }
    this._path = {
      id: parseInt(Math.random() * 100000000), color: this.props.strokeColor,
      width: this.props.strokeWidth, data: []
    }

    UIManager.dispatchViewManagerCommand(
      this._handle,
      UIManager.RNSketchCanvas.Commands.newPath,
      [
        this._path.id,
        processColor(this._path.color),
        this._path.width * this._screenScale
      ]
    )
    UIManager.dispatchViewManagerCommand(
      this._handle,
      UIManager.RNSketchCanvas.Commands.addPoint,
      [
        parseFloat((gestureState.x0 - this._offset.x).toFixed(2) * this._screenScale),
        parseFloat((gestureState.y0 - this._offset.y).toFixed(2) * this._screenScale)
      ]
    )
    const x = parseFloat((gestureState.x0 - this._offset.x).toFixed(2)), y = parseFloat((gestureState.y0 - this._offset.y).toFixed(2))
    this._path.data.push(`${x},${y}`)
    this.props.onStrokeStart(x, y)
    if (gestureState.vx == 0 && gestureState.vy == 0) {
      this.state.shouldDelete.push(this._path)
    }
  }

  componentWillMount() {
    this.panResponder = PanResponder.create({
      // Ask to be the responder:
      onStartShouldSetPanResponder: (evt, gestureState) => () => {
        console.log
        return true;
      },
      onStartShouldSetPanResponderCapture: (evt, gestureState) => {
        if (gestureState.numberActiveTouches == 2) {
          this.setState({ activeTouches: 2 })
        } else { 
          this.setState({ activeTouches: 1 })
        }
        setTimeout(() => {
          return true;
        }, 1000)
      },
      onMoveShouldSetPanResponder: (evt, gestureState) => () => {
        return true;
      },
      onMoveShouldSetPanResponderCapture: (evt, gestureState) => () => {
        return true;
      },
      onPanResponderGrant: (evt, gestureState) => {
        if (!this.props.touchEnabled || gestureState.numberActiveTouches == 2) return
        this.touchStartTime = new Date().getTime();
        this.isDrawing = false;
        // const e = evt.nativeEvent
        // this._offset = { x: e.pageX - e.locationX, y: e.pageY - e.locationY }
        // this._path = {
        //   id: parseInt(Math.random() * 100000000), color: this.props.strokeColor,
        //   width: this.props.strokeWidth, data: []
        // }
        // UIManager.dispatchViewManagerCommand(
        //   this._handle,
        //   UIManager.RNSketchCanvas.Commands.newPath,
        //   [
        //     this._path.id,
        //     processColor(this._path.color),
        //     this._path.width * this._screenScale
        //   ]
        // )
        // UIManager.dispatchViewManagerCommand(
        //   this._handle,
        //   UIManager.RNSketchCanvas.Commands.addPoint,
        //   [
        //     parseFloat((gestureState.x0 - this._offset.x).toFixed(2) * this._screenScale),
        //     parseFloat((gestureState.y0 - this._offset.y).toFixed(2) * this._screenScale)
        //   ]
        // )
        // const x = parseFloat((gestureState.x0 - this._offset.x).toFixed(2)), y = parseFloat((gestureState.y0 - this._offset.y).toFixed(2))
        // this._path.data.push(`${x},${y}`)
        // this.props.onStrokeStart(x, y)
        // if (gestureState.vx == 0 && gestureState.vy == 0) {
        //   this.state.shouldDelete.push(this._path)
        // }
               
      },
      onPanResponderMove: (evt, gestureState) => {
        //console.log('respondermove sketchcanvas')
        if (!this.props.touchEnabled || gestureState.numberActiveTouches == 2) return
        if (!this.validateDrawingState(evt, gestureState)) return;
        if (this._path) {
          if (this.state.zoomx && this.state.zoomy) {
            const x = parseFloat((gestureState.x0 + gestureState.dx / this.state.zoomscale - this._offset.x).toFixed(2)), y = parseFloat((gestureState.y0 + gestureState.dy / this.state.zoomscale - this._offset.y).toFixed(2))

            UIManager.dispatchViewManagerCommand(this._handle, UIManager.RNSketchCanvas.Commands.addPoint, [
              parseFloat((x).toFixed(2)),
              parseFloat((y).toFixed(2))
            ])
           
            this._path.data.push(`${x},${y}`)
            this.props.onStrokeChanged(x, y)
          } else {
            UIManager.dispatchViewManagerCommand(this._handle, UIManager.RNSketchCanvas.Commands.addPoint, [
              parseFloat((gestureState.moveX - this._offset.x).toFixed(2) * this._screenScale),
              parseFloat((gestureState.moveY - this._offset.y).toFixed(2) * this._screenScale)
            ])
            const x = parseFloat((gestureState.moveX - this._offset.x).toFixed(2)), y = parseFloat((gestureState.moveY - this._offset.y).toFixed(2))
            // console.log('x: ', x)
            // console.log('y: ', y)
            this._path.data.push(`${x},${y}`)
            this.props.onStrokeChanged(x, y)
          }
          
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (!this.props.touchEnabled || gestureState.numberActiveTouches == 2) return
        if (!this.validateDrawingState(evt, gestureState)) return;
        if (this._path) {
          console.log('release path: ', this._path)
          this.props.onStrokeEnd({ path: this._path, size: this._size, drawer: this.props.user })
          this.setState({ path: this._path, paths: [...this.state.paths, this._path]})
          this._paths.push({ path: this._path, size: this._size, drawer: this.props.user })
        }
        UIManager.dispatchViewManagerCommand(this._handle, UIManager.RNSketchCanvas.Commands.endPath, [])
      },

      onShouldBlockNativeResponder: (evt, gestureState) => {
        return true;
      },
    });
  }

  async componentDidMount() {
    const isStoragePermissionAuthorized = await requestPermissions(
      this.props.permissionDialogTitle,
      this.props.permissionDialogMessage,
    );
    Dimensions.addEventListener('change', this.orientationChange);
  }

  handleLayoutChange() { 
    this.view.measure( (fx, fy, width, height, px, py) => {
      console.log('Component width is: ' + width)
      console.log('Component height is: ' + height)
      console.log('X offset to page: ' + px)
      console.log('Y offset to page: ' + py)

      this._size = { width: width, height: height };
      this._offset = { x: width - px, y: py };

      this.setState({ defaultDimensions: this._size })

      Image.getSize(this.props.localSourceImage.filename, (width, height) => {
        let imageWidth = width;
        let imageHeight = height;
        let imageRatio = width/height;
        let targetRatio = this.state.width / this.state.height;
        let scaleFactor = targetRatio > imageRatio ? this.state.height / imageHeight : this.state.width / imageWidth;
        let newWidth = imageWidth * scaleFactor;
        let newHeight = imageHeight * scaleFactor;

        if (this.state.width < this.state.height) {
          this.setState({ portraitHeight: newHeight, portraitWidth: newWidth, portraitDimensions: this._size, })
        } else {
          this.setState({ landscapeHeight: newHeight, landscapeWidth: newWidth, landscapeDimensions: this._size, })
        }

        this._initialized = true;
        if (this._paths.length > 0) {
          if (this.state.width > this.state.height) {
            this._paths.forEach(path => {
              let newArray = [];
              let dataArray = Array.from(new Set(path.path.data));
              dataArray.forEach((point, index) => {
                let xy = point.split(',');
                let OldX = parseFloat(xy[0]);
                let OldY = parseFloat(xy[1]);
                let newX = OldX * (self.state.landscapeWidth / self.state.portraitWidth);
                let newY = OldY * (self.state.landscapeHeight / self.state.portraitHeight);
                newArray.push("" + newX + "," + newY + "");
                if (index == dataArray.length-1) {
                  console.log('hello')
                }
              });
              this.deletePath(path.path.id);
              let pathObj = {
                size: {
                  height: this._size.height,
                  width: this._size.width,
                },
                path: {
                  id: parseInt(Math.random() * 100000000), 
                  color: this.props.strokeColor,
                  width: this.props.strokeWidth, 
                  data: newArray
                },
              }

              UIManager.dispatchViewManagerCommand(this._handle, UIManager.RNSketchCanvas.Commands.addPath, [
                pathObj.path.id, processColor(pathObj.path.color), pathObj.path.width * this._screenScale, newArray
              ])
              this._paths.push(pathObj)
              this.setState({ orientationChanged: false })
            })
          }
          else { 
            this._paths.forEach(path => {
              let newArray = [];
              Array.from(new Set (path.path.data)).forEach((point, index) => {
                let xy = point.split(',');
                let OldX = parseFloat(xy[0]);
                let OldY = parseFloat(xy[1]);
                let newX = (OldX * self.state.portraitWidth) / self.state.landscapeWidth;
                let newY = (OldY * self.state.portraitHeight) / self.state.landscapeHeight;
                newArray.push("" + newX + "," + newY + "");
              });
              this.deletePath(path.path.id);
              let pathObj = {
                size: {
                  height: this._size.height,
                  width: this._size.width,
                },
                path: {
                  id: parseInt(Math.random() * 100000000), 
                  color: this.props.strokeColor,
                  width: this.props.strokeWidth, 
                  data: newArray
                },
              }
              UIManager.dispatchViewManagerCommand(this._handle, UIManager.RNSketchCanvas.Commands.addPath, [
                pathObj.path.id, processColor(pathObj.path.color), pathObj.path.width * this._screenScale, newArray
              ])
              this._paths.push(pathObj)
              this.setState({ orientationChanged: false })
            })
          }
        }
        this._pathsToProcess.length > 0 && this._pathsToProcess.forEach(p => this.addPath(p))
      }, () => {})
    })
  }

  render() {
    return (
      <ImageZoom 
        cropWidth={Dimensions.get('window').width}
        cropHeight={Dimensions.get('window').height}
        imageWidth={Dimensions.get('window').width}
        imageHeight={Dimensions.get('window').height}
        onMove={(position) => {
          //console.log(position)
          const x = position.positionX
          const y = position.positionY
          const scale = position.scale
          if (zooming == 0) {
            if (this.state.shouldDelete.length > 0 && this.state.activeTouches == 1) {
              this.deletePath(this.state.shouldDelete[this.state.shouldDelete.length-1].id)
            }
          }      
          this.setState({
            zoomx: x,
            zoomy: y,
            zoomscale: scale,
          })          
          zooming = 1;
        }}
        responderRelease={(vx) => {
          zooming = 0;
        }}
      >
        <RNSketchCanvas
          ref={ref => {
            this._handle = ReactNative.findNodeHandle(ref)
            this.view = ref;
          }}
          style={this.props.style}
          onLayout={e => {
            this.handleLayoutChange(e);
          }}
          {...this.panResponder.panHandlers}
          onChange={(e) => {

            if (e.nativeEvent.hasOwnProperty('pathsUpdate')) {
              this.props.onPathsChange(e.nativeEvent.pathsUpdate)
            } else if (e.nativeEvent.hasOwnProperty('success') && e.nativeEvent.hasOwnProperty('path')) {
              this.props.onSketchSaved(e.nativeEvent.success, e.nativeEvent.path)
            } else if (e.nativeEvent.hasOwnProperty('success')) {
              this.props.onSketchSaved(e.nativeEvent.success)
            }
          }}
          localSourceImage={this.props.localSourceImage}
          permissionDialogTitle={this.props.permissionDialogTitle}
          permissionDialogMessage={this.props.permissionDialogMessage}
          text={this.state.text}
        />
      </ImageZoom>
    );
  }
}

SketchCanvas.MAIN_BUNDLE = Platform.OS === 'ios' ? UIManager.RNSketchCanvas.Constants.MainBundlePath : '';
SketchCanvas.DOCUMENT = Platform.OS === 'ios' ? UIManager.RNSketchCanvas.Constants.NSDocumentDirectory : '';
SketchCanvas.LIBRARY = Platform.OS === 'ios' ? UIManager.RNSketchCanvas.Constants.NSLibraryDirectory : '';
SketchCanvas.CACHES = Platform.OS === 'ios' ? UIManager.RNSketchCanvas.Constants.NSCachesDirectory : '';

module.exports = SketchCanvas;
