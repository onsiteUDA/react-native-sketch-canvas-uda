import React from 'react'
import PropTypes from 'prop-types'
import ReactNative, {
  View,
  ScrollView,
  Text,
  TouchableOpacity,
  FlatList,
  ViewPropTypes,
  StyleSheet,
  Dimensions
} from 'react-native'
import SketchCanvas from './src/SketchCanvas'
import { requestPermissions } from './src/handlePermissions';
import DeviceInfo from 'react-native-device-info';
import tinycolor from 'tinycolor2';
import {
  SlidersColorPicker,
  HueSlider,
  SaturationSlider,
  LightnessSlider
} from 'react-native-color';
import Orientation from 'react-native-orientation';
import FontAwesome from 'react-native-vector-icons/FontAwesome';

const hasNotch = DeviceInfo.hasNotch() || DeviceInfo.getDeviceId().includes('iPhone13');

export default class RNSketchCanvas extends React.Component {
  static propTypes = {
    containerStyle: ViewPropTypes.style,
    canvasStyle: ViewPropTypes.style,
    onStrokeStart: PropTypes.func,
    onStrokeChanged: PropTypes.func,
    onStrokeEnd: PropTypes.func,
    onClosePressed: PropTypes.func,
    onUndoPressed: PropTypes.func,
    onClearPressed: PropTypes.func,
    onPathsChange: PropTypes.func,
    user: PropTypes.string,

    closeComponent: PropTypes.node,
    eraseComponent: PropTypes.node,
    undoComponent: PropTypes.node,
    clearComponent: PropTypes.node,
    saveComponent: PropTypes.node,
    editToolComponent: PropTypes.node,
    strokeComponent: PropTypes.func,
    strokeSelectedComponent: PropTypes.func,
    strokeWidthComponent: PropTypes.func,

    strokeColors: PropTypes.arrayOf(PropTypes.shape({ color: PropTypes.string })),
    defaultStrokeIndex: PropTypes.number,
    defaultStrokeWidth: PropTypes.number,

    minStrokeWidth: PropTypes.number,
    maxStrokeWidth: PropTypes.number,
    strokeWidthStep: PropTypes.number,

    savePreference: PropTypes.func,
    onSketchSaved: PropTypes.func,

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
    localSourceImage: PropTypes.shape({ filename: PropTypes.string, directory: PropTypes.string, mode: PropTypes.string }),

    permissionDialogTitle: PropTypes.string,
    permissionDialogMessage: PropTypes.string,
  };

  static defaultProps = {
    containerStyle: null,
    canvasStyle: null,
    onStrokeStart: () => { },
    onStrokeChanged: () => { },
    onStrokeEnd: () => { },
    onClosePressed: () => { },
    onUndoPressed: () => { },
    onClearPressed: () => { },
    onPathsChange: () => { },
    user: null,

    closeComponent: null,
    eraseComponent: null,
    undoComponent: null,
    clearComponent: null,
    saveComponent: null,
    strokeComponent: null,
    strokeSelectedComponent: null,
    strokeWidthComponent: null,

    strokeColors: [
      { color: '#000000' },
      { color: '#FF0000' },
      { color: '#00FFFF' },
      { color: '#0000FF' },
      { color: '#0000A0' },
      { color: '#ADD8E6' },
      { color: '#800080' },
      { color: '#FFFF00' },
      { color: '#00FF00' },
      { color: '#FF00FF' },
      { color: '#FFFFFF' },
      { color: '#C0C0C0' },
      { color: '#808080' },
      { color: '#FFA500' },
      { color: '#A52A2A' },
      { color: '#800000' },
      { color: '#008000' },
      { color: '#808000' }],
    alphlaValues: ['33', '77', 'AA', 'FF'],
    defaultStrokeIndex: 0,
    defaultStrokeWidth: 3,

    minStrokeWidth: 3,
    maxStrokeWidth: 15,
    strokeWidthStep: 3,

    savePreference: null,
    onSketchSaved: () => { },
    onBackPressed: () => { },

    text: null,
    localSourceImage: null,
    imageDimensions: null,

    permissionDialogTitle: '',
    permissionDialogMessage: '',
  };


  constructor(props) {
    super(props)

    this.state = {
      color: props.strokeColors[props.defaultStrokeIndex].color,
      strokeWidth: props.defaultStrokeWidth,
      alpha: 'FF',
      showColorTool: false,
      setTinycolor: tinycolor('red').toHsl(),
      width: Dimensions.get('window').width,
      height: Dimensions.get('window').height,
    }

    this._colorChanged = false
    this._strokeWidthStep = props.strokeWidthStep
    this._alphaStep = -1;
    self = this;
    Dimensions.addEventListener('change', this.orientationChange);
  }

  orientationChange(e) {
    self.setState({ width: e.window.width, height: e.window.height })
  }

  updateHue = h => this.setState({ setTinycolor: { ...this.state.setTinycolor, h }, color: tinycolor(this.state.setTinycolor).toHexString()  });
  updateSaturation = s => this.setState({ setTinycolor: { ...this.state.setTinycolor, s }, color: tinycolor(this.state.setTinycolor).toHexString() });
  updateLightness = l => this.setState({ setTinycolor: { ...this.state.setTinycolor, l }, color: tinycolor(this.state.setTinycolor).toHexString() });


  clear() {
    this._sketchCanvas.clear()
  }

  undo() {
    return this._sketchCanvas.undo()
  }

  addPath(data) {
    this._sketchCanvas.addPath(data)
  }

  deletePath(id) {
    this._sketchCanvas.deletePath(id)
  }

  save() {
    if (this.props.savePreference) {
      const p = this.props.savePreference()
      this._sketchCanvas.save(p.imageType, p.transparent, p.folder ? p.folder : '', p.filename, p.includeImage !== false, p.includeText !== false, p.cropToImageSize || false)
    } else {
      const date = new Date()
      this._sketchCanvas.save('png', false, '', 
        date.getFullYear() + '-' + (date.getMonth() + 1) + '-' + ('0' + date.getDate()).slice(-2) + ' ' + ('0' + date.getHours()).slice(-2) + '-' + ('0' + date.getMinutes()).slice(-2) + '-' + ('0' + date.getSeconds()).slice(-2),
        true, true, false)
    }
  }

  nextStrokeWidth() {
    if ((this.state.strokeWidth >= this.props.maxStrokeWidth && this._strokeWidthStep > 0) ||
      (this.state.strokeWidth <= this.props.minStrokeWidth && this._strokeWidthStep < 0))
      this._strokeWidthStep = -this._strokeWidthStep
    this.setState({ strokeWidth: this.state.strokeWidth + this._strokeWidthStep })
  }

  componentDidUpdate() {
    this._colorChanged = false
  }

  componentWillUnmount() {
    Dimensions.removeEventListener('change', this.orientationChange);
  }

  async componentDidMount() {
    const isStoragePermissionAuthorized = await requestPermissions(
      this.props.permissionDialogTitle,
      this.props.permissionDialogMessage,
    );

    if (this.props.imageDimensions.width < this.props.imageDimensions.height) {
      Orientation.lockToPortrait();
    }
  }

  calculateSize(type) {
    let imageWidth = this.props.imageDimensions.width;
    let imageHeight = this.props.imageDimensions.height;
    let imageRatio = imageWidth/imageHeight;
    let targetHeight = this.state.height;
    let targetWidth = this.state.width;
    let targetRatio = this.state.width / this.state.height;
    let scaleFactor = targetRatio > imageRatio && this.state.width > this.state.height ? targetHeight / imageHeight : targetWidth / imageWidth;
    let newWidth = imageWidth * scaleFactor;
    let newHeight = imageHeight * scaleFactor; 
    
    if (type == 'width') {
      return newWidth;
    } else if (type == 'height') {
      return newHeight;
    }

  }

  render() {
    console.log('index.js sketchcanvas')
    return (
      <View style={this.props.containerStyle}>

       <TouchableOpacity style={{position: 'absolute', top: hasNotch? 35 : 20, left: 5, zIndex: 10}} onPress={() => this.props.onBackPressed(true)}>
          <FontAwesome name='chevron-left' style={{ paddingLeft: 14, fontSize: 24, color: 'white' }} />
        </TouchableOpacity>

        {this.state.width < this.state.height &&
          <View style={{ flexDirection: 'column', position: this.props.imageDimensions.width < this.props.imageDimensions.height ? 'absolute' : 'absolute', bottom: hasNotch ? 15 : 0, zIndex: 10, width: this.state.width, paddingHorizontal: 10}}>
            <View style={{  flexDirection: 'row', alignItems: 'stretch', justifyContent: 'space-between'}}>
              {this.props.eraseComponent && (
                <TouchableOpacity style={{}} onPress={() => { this.setState({ color: '#00000000' }) }}>
                  {this.props.eraseComponent}
                </TouchableOpacity>)
              }
              {this.props.undoComponent && (
                <TouchableOpacity onPress={() => { this.props.onUndoPressed(this.undo()) }}>
                  {this.props.undoComponent}
                </TouchableOpacity>)
              }

              {this.props.strokeWidthComponent && (
                <TouchableOpacity onPress={() => { this.nextStrokeWidth() }}>
                  {this.props.strokeWidthComponent(this.state.strokeWidth)}
                </TouchableOpacity>)
              }
              
              {this.props.editToolComponent && (
                  <TouchableOpacity onPress={() => { 
                    this.setState({ showColorTool: !this.state.showColorTool, color: tinycolor(this.state.setTinycolor).toHexString() }) 
                  }}>
                  {this.props.editToolComponent}
                  </TouchableOpacity>)
              }

              {this.props.clearComponent && (
                <TouchableOpacity onPress={() => { this.clear(); this.props.onClearPressed() }}>
                  {this.props.clearComponent}
                </TouchableOpacity>)
              }

              {this.props.saveComponent && (
                <TouchableOpacity onPress={() => { this.save() }}>
                  {this.props.saveComponent}
                </TouchableOpacity>)
              }
            </View>
          </View>
        }            
        
        {this.state.width < this.state.height && 
          <View style={[{ display: this.state.showColorTool ? 'flex' : 'none', position: 'absolute', zIndex: 11, bottom: hasNotch ? 65 : 50 }]}>
            <View style={{backgroundColor: 'rgba(0, 0, 0, 0.1)'}}> 
              <HueSlider
                style={[styles.sliderRow, { width: this.state.width-25 }]}
                gradientSteps={30}
                value={this.state.setTinycolor.h}
                onValueChange={this.updateHue}
              />   
              <LightnessSlider
                style={[styles.sliderRow, { width: this.state.width-25 }]}
                gradientSteps={20}
                value={this.state.setTinycolor.l}
                color={this.state.setTinycolor}
                onValueChange={this.updateLightness}
              />
            </View>
          </View>
        }  
        
        <View style={{flexDirection: 'row',}}>
          <SketchCanvas
            ref={ref => this._sketchCanvas = ref}
            style={{marginVertical: (this.state.height - this.calculateSize('height'))/2, alignSelf: 'center', height: this.calculateSize('height'), width: this.calculateSize('width')}}
            strokeColor={this.state.color + (this.state.color.length === 9 ? '' : this.state.alpha)}
            onStrokeStart={() => {
              this.setState({ showColorTool: false })
              this.props.onStrokeStart
            }}
            onStrokeChanged={this.props.onStrokeChanged}
            onStrokeEnd={this.props.onStrokeEnd}
            onBackPressed={(pressed) => this.props.onBackPressed()}
            user={this.props.user}
            strokeWidth={this.state.strokeWidth}
            onSketchSaved={(success, path) => this.props.onSketchSaved(success, path)}
            onPathsChange={this.props.onPathsChange}
            text={this.props.text}
            localSourceImage={this.props.localSourceImage}
            imageDimensions={this.props.imageDimensions}
            permissionDialogTitle={this.props.permissionDialogTitle}
            permissionDialogMessage={this.props.permissionDialogMessage}
          />

          {this.state.width > this.state.height && 
            <View style={[{ display: this.state.showColorTool ? 'flex' : 'none', position: 'absolute', top: 20, left: 90, backgroundColor: 'rgba(0, 0, 0, 0.1)' }]}>
              <HueSlider
                style={[styles.sliderRow, { width: this.state.width-200 }]}
                gradientSteps={30}
                value={this.state.setTinycolor.h}
                onValueChange={this.updateHue}
              />   
              <LightnessSlider
                style={[styles.sliderRow, { width: this.state.width-200 }]}
                gradientSteps={20}
                value={this.state.setTinycolor.l}
                color={this.state.setTinycolor}
                onValueChange={this.updateLightness}
              />
            </View>
          }

          {this.state.width > this.state.height &&
          <View style={{ flexDirection: 'column', zIndex: 10 }}>
            <View style={{ position: 'absolute', right: hasNotch ? 20 : 10, top: 10, flexDirection: 'column', alignItems: 'space-between', justifyContent: 'space-between', }}>
              {this.props.eraseComponent && (
                <TouchableOpacity onPress={() => { this.setState({ color: '#00000000' }) }}>
                  {this.props.eraseComponent}
                </TouchableOpacity>)
              }
              {this.props.undoComponent && (
                <TouchableOpacity onPress={() => { this.props.onUndoPressed(this.undo()) }}>
                  {this.props.undoComponent}
                </TouchableOpacity>)
              }

              {this.props.strokeWidthComponent && (
                <TouchableOpacity onPress={() => { this.nextStrokeWidth() }}>
                  {this.props.strokeWidthComponent(this.state.strokeWidth)}
                </TouchableOpacity>)
              }
              
              {this.props.editToolComponent && (
                  <TouchableOpacity onPress={() => { 
                    this.setState({ showColorTool: !this.state.showColorTool, color: tinycolor(this.state.setTinycolor).toHexString() }) 
                  }}>
                  {this.props.editToolComponent}
                  </TouchableOpacity>)
              }

              {this.props.clearComponent && (
                <TouchableOpacity onPress={() => { this.clear(); this.props.onClearPressed() }}>
                  {this.props.clearComponent}
                </TouchableOpacity>)
              }

              {this.props.saveComponent && (
                <TouchableOpacity onPress={() => { this.save() }}>
                  {this.props.saveComponent}
                </TouchableOpacity>)
              }
            </View>
          </View>
          }    
        </View>

      </View>
    );
  }
};

const styles = StyleSheet.create({
  sliderRow: {
    alignSelf: 'stretch',
    marginHorizontal: 12,
    width: Dimensions.get('window').width-25
  },
})


RNSketchCanvas.MAIN_BUNDLE = SketchCanvas.MAIN_BUNDLE;
RNSketchCanvas.DOCUMENT = SketchCanvas.DOCUMENT;
RNSketchCanvas.LIBRARY = SketchCanvas.LIBRARY;
RNSketchCanvas.CACHES = SketchCanvas.CACHES;

export {
  SketchCanvas
}

// _renderItem = ({ item, index }) => (
//   <TouchableOpacity style={{ marginHorizontal: 2.5 }} onPress={() => {
//     console.log('_renderItem sketchcanvas')
//     if (this.state.color === item.color) {
//       const index = this.props.alphlaValues.indexOf(this.state.alpha)
//       if (this._alphaStep < 0) {
//         this._alphaStep = index === 0 ? 1 : -1
//         this.setState({ alpha: this.props.alphlaValues[index + this._alphaStep] })
//       } else {
//         this._alphaStep = index === this.props.alphlaValues.length - 1 ? -1 : 1
//         this.setState({ alpha: this.props.alphlaValues[index + this._alphaStep] })
//       }
//     } else {
//       this.setState({ color: item.color })
//       this._colorChanged = true
//     }
//   }}>
//     {this.state.color !== item.color && this.props.strokeComponent && this.props.strokeComponent(item.color)}
//     {this.state.color === item.color && this.props.strokeSelectedComponent && this.props.strokeSelectedComponent(item.color + this.state.alpha, index, this._colorChanged)}
//   </TouchableOpacity>
// )

{/* <View style={{ flexDirection: 'row', backgroundColor: '#333132', position: 'absolute', bottom: hasNotch ? 15 : 0}}>
  <FlatList
    data={this.props.strokeColors}
    extraData={this.state}
    keyExtractor={() => Math.ceil(Math.random() * 10000000).toString()}
    renderItem={this._renderItem}
    horizontal
    showsHorizontalScrollIndicator={false}
  />
</View> */}